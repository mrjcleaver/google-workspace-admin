import { google } from "googleapis";
import type { AuditResult } from "../types.js";

export interface SheetsOptions {
  spreadsheetId: string;
  /** Sheet/tab name. Created if it does not exist. */
  sheetName?: string;
  /** Service account JSON. If omitted, defaults to GOOGLE_APPLICATION_CREDENTIALS. */
  credentialsJson?: string;
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Mint an SA-impersonation token via the IAM Credentials REST API.
 * Used as a workaround for codespace-local runs where end-user ADC's OAuth
 * client is blocked from being granted sensitive scopes (Workspace policy),
 * so we can't get a `spreadsheets`-scoped token via the normal ADC flow.
 * Requires the source ADC principal to have token-creator on the target SA
 * AND serviceUsageConsumer on the SA's GCP project — the X-Goog-User-Project
 * header is what unblocks the discovery call.
 */
async function mintImpersonatedSheetsToken(
  targetServiceAccount: string,
  quotaProject: string,
): Promise<string> {
  const sourceAuth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const sourceClient = await sourceAuth.getClient();
  const sourceTokenResp = await sourceClient.getAccessToken();
  const sourceToken = typeof sourceTokenResp === "string" ? sourceTokenResp : sourceTokenResp.token;
  if (!sourceToken) throw new Error("could not obtain source ADC token");

  const resp = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(targetServiceAccount)}:generateAccessToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sourceToken}`,
        "Content-Type": "application/json",
        "X-Goog-User-Project": quotaProject,
      },
      body: JSON.stringify({ scope: SCOPES, lifetime: "600s" }),
    },
  );
  if (!resp.ok) {
    throw new Error(`generateAccessToken failed (${resp.status}): ${await resp.text()}`);
  }
  const body = (await resp.json()) as { accessToken: string };
  return body.accessToken;
}

async function getClient(opts: SheetsOptions) {
  const impersonate = process.env.IMPERSONATE_SERVICE_ACCOUNT;
  if (impersonate) {
    const quotaProject = process.env.GOOGLE_CLOUD_QUOTA_PROJECT ?? impersonate.split("@")[1].split(".")[0];
    const token = await mintImpersonatedSheetsToken(impersonate, quotaProject);
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    return google.sheets({ version: "v4", auth });
  }
  const auth = opts.credentialsJson
    ? new google.auth.GoogleAuth({ credentials: JSON.parse(opts.credentialsJson), scopes: SCOPES })
    : new google.auth.GoogleAuth({ scopes: SCOPES });
  return google.sheets({ version: "v4", auth: await auth.getClient() as any });
}

function toRows(result: AuditResult): (string | number | boolean)[][] {
  const header = [
    "primaryEmail",
    "status",
    "reason",
    "forwardingAddresses",
    "verified",
    "disposition",
    "recoveryEmail",
    "groups",
    "lastLoginTime",
    "daysSinceLogin",
    "unreachable",
    "isAdmin",
    "isSuspended",
    "lastChecked",
  ];
  const data = result.records.map((r) => [
    r.primaryEmail,
    r.status,
    r.reason,
    r.forwardingAddresses.map((f) => f.forwardingAddress).join("; "),
    r.forwardingAddresses.map((f) => f.verified ?? "").join("; "),
    r.forwardingAddresses.map((f) => f.disposition ?? "").join("; "),
    r.recoveryEmail,
    r.groups.join("; "),
    r.lastLoginTime,
    r.daysSinceLogin === -1 ? "never" : r.daysSinceLogin,
    r.unreachable,
    r.isAdmin,
    r.isSuspended,
    r.lastChecked,
  ]);
  return [header, ...data];
}

export async function writeSheetsReport(result: AuditResult, opts: SheetsOptions): Promise<void> {
  const sheets = await getClient(opts);
  const sheetName = opts.sheetName ?? "Forwarding Audit";

  // Ensure the tab exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId: opts.spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === sheetName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: opts.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
  }

  // Replace contents
  await sheets.spreadsheets.values.clear({
    spreadsheetId: opts.spreadsheetId,
    range: sheetName,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: opts.spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: toRows(result) },
  });
}
