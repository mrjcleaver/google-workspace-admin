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

async function getClient(opts: SheetsOptions) {
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
