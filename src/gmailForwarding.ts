import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import type { ForwardingEntry } from "./types.js";

const CALLER_SCOPE = "https://www.googleapis.com/auth/iam";
const GMAIL_SETTINGS_SCOPE = "https://www.googleapis.com/auth/gmail.settings.basic";

export interface GmailForwardingOptions {
  /** Service account to impersonate Workspace users as, via domain-wide delegation. */
  serviceAccountEmail: string;
  /** Max users queried at once. */
  concurrency?: number;
}

function describeError(e: unknown): string {
  const err = e as { response?: { status?: number; data?: unknown }; message?: string };
  if (err?.response) {
    return `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
  }
  return e instanceof Error ? e.message : String(e);
}

interface ExternalAccountCredentials {
  type: string;
  audience: string;
  token_url: string;
  service_account_impersonation_url?: string;
}

async function getGithubOidcToken(audience: string): Promise<string> {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "ACTIONS_ID_TOKEN_REQUEST_URL/TOKEN not set — the job needs `permissions: id-token: write`",
    );
  }
  const resp = await fetch(`${url}&audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`fetching GitHub OIDC token failed (${resp.status}): ${await resp.text()}`);
  const body = (await resp.json()) as { value: string };
  return body.value;
}

/**
 * Mints a token that IS the impersonated service account, by hand — mirroring
 * the exact sequence GAM's own Python client performs for the same WIF
 * credentials file (GitHub OIDC -> STS token exchange -> IAM Credentials
 * generateAccessToken). google-auth-library's ExternalAccountClient returns a
 * bare federated token from getAccessToken() without necessarily completing
 * the impersonation hop, which isn't itself authorized to call signJwt on the
 * target SA — hence doing the exchange explicitly here.
 */
async function selfAccessToken(): Promise<string> {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS is required to fetch forwarding data live");
  const creds = JSON.parse(await readFile(credPath, "utf8")) as ExternalAccountCredentials;
  if (creds.type !== "external_account" || !creds.service_account_impersonation_url) {
    throw new Error(
      `expected an external_account (WIF) credential with service_account_impersonation_url, got type=${creds.type}`,
    );
  }

  try {
    const audience = creds.audience.replace(/^\/\//, "https://");
    const oidcToken = await getGithubOidcToken(audience);

    const stsResp = await fetch(creds.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience: creds.audience,
        scope: CALLER_SCOPE,
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        subject_token: oidcToken,
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      }),
    });
    if (!stsResp.ok) throw new Error(`STS token exchange failed (${stsResp.status}): ${await stsResp.text()}`);
    const { access_token: federatedToken } = (await stsResp.json()) as { access_token: string };

    const impResp = await fetch(creds.service_account_impersonation_url, {
      method: "POST",
      headers: { Authorization: `Bearer ${federatedToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: [CALLER_SCOPE], lifetime: "3600s" }),
    });
    if (!impResp.ok) {
      throw new Error(`generateAccessToken failed (${impResp.status}): ${await impResp.text()}`);
    }
    const { accessToken } = (await impResp.json()) as { accessToken: string };
    return accessToken;
  } catch (e) {
    throw new Error(`could not obtain a caller access token to sign DWD JWTs: ${describeError(e)}`);
  }
}

/**
 * Hand-rolled domain-wide delegation: GAM requests one bundled Gmail scope
 * set (mail.google.com + gmail.modify + gmail.settings.sharing +
 * settings.basic) for every Gmail subcommand it supports, so authorizing it
 * in the Admin Console means granting mailbox-wide read/send/delete for
 * every user just to read forwarding rules. This mints a token scoped to
 * gmail.settings.basic only — the scope the Gmail API docs list as
 * sufficient for forwardingAddresses.list / getAutoForwarding.
 */
async function mintUserToken(
  serviceAccountEmail: string,
  userEmail: string,
  callerToken: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    iat: now,
    exp: now + 3600,
    iss: serviceAccountEmail,
    aud: "https://oauth2.googleapis.com/token",
    scope: GMAIL_SETTINGS_SCOPE,
    sub: userEmail,
  });
  const signResp = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${callerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    },
  );
  if (!signResp.ok) {
    throw new Error(`signJwt failed for ${userEmail} (${signResp.status}): ${await signResp.text()}`);
  }
  const { signedJwt } = (await signResp.json()) as { signedJwt: string };

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });
  if (!tokenResp.ok) {
    throw new Error(
      `DWD token exchange failed for ${userEmail} (${tokenResp.status}): ${await tokenResp.text()}`,
    );
  }
  const { access_token } = (await tokenResp.json()) as { access_token: string };
  return access_token;
}

async function fetchOneUser(
  serviceAccountEmail: string,
  userEmail: string,
  callerToken: string,
): Promise<ForwardingEntry[]> {
  const userToken = await mintUserToken(serviceAccountEmail, userEmail, callerToken);
  const authClient = new google.auth.OAuth2();
  authClient.setCredentials({ access_token: userToken });
  const gmail = google.gmail({ version: "v1", auth: authClient });

  const [addressesResp, autoResp] = await Promise.all([
    gmail.users.settings.forwardingAddresses.list({ userId: userEmail }),
    gmail.users.settings.getAutoForwarding({ userId: userEmail }),
  ]);
  const auto = autoResp.data;

  const entries: ForwardingEntry[] = (addressesResp.data.forwardingAddresses ?? []).map((a) => {
    const isActive = !!auto.enabled && auto.emailAddress === a.forwardingEmail;
    return {
      forwardingAddress: a.forwardingEmail ?? "",
      verified: a.verificationStatus === "accepted",
      disposition: isActive ? (auto.disposition ?? undefined) : undefined,
      enabled: isActive,
    };
  });

  // autoForwarding can reference an address that never shows up in
  // forwardingAddresses.list (seen with older/imported configs) — surface it
  // anyway so an active forward doesn't silently disappear from compliance.
  if (auto.enabled && auto.emailAddress && !entries.some((e) => e.forwardingAddress === auto.emailAddress)) {
    entries.push({
      forwardingAddress: auto.emailAddress,
      verified: undefined,
      disposition: auto.disposition ?? undefined,
      enabled: true,
    });
  }

  return entries;
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function fetchForwardingByUser(
  userEmails: string[],
  opts: GmailForwardingOptions,
): Promise<Map<string, ForwardingEntry[]>> {
  const callerToken = await selfAccessToken();
  const byUser = new Map<string, ForwardingEntry[]>();
  await runWithConcurrency(userEmails, opts.concurrency ?? 5, async (email) => {
    try {
      const entries = await fetchOneUser(opts.serviceAccountEmail, email, callerToken);
      if (entries.length > 0) byUser.set(email.toLowerCase(), entries);
    } catch (e) {
      process.stderr.write(`warn: skipping forwarding lookup for ${email} (${describeError(e)})\n`);
    }
  });
  return byUser;
}
