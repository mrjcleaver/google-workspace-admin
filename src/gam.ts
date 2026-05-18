import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

export interface GamRunOptions {
  gamPath?: string;
  timeoutMs?: number;
}

/**
 * Run a GAM command and capture stdout as text. GAM writes its CSV to stdout
 * when invoked as `gam print ... | cat`, so we don't use the `redirect csv`
 * variant — we just collect stdout directly.
 */
export function runGam(args: string[], opts: GamRunOptions = {}): Promise<string> {
  const gam = opts.gamPath ?? process.env.GAM_PATH ?? "gam";
  return new Promise((resolve, reject) => {
    const child = spawn(gam, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`gam timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : undefined;
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`failed to launch gam (${gam}): ${e.message}`));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`gam exited ${code}: ${stderr.trim() || "no stderr"}`));
    });
  });
}

export async function fetchForwardingCsv(opts: GamRunOptions = {}): Promise<string> {
  // GAM7 syntax: `gam all users print forward` — one row per user with
  // forwardingEnabled, forwardingEmail, disposition.
  return runGam(["all", "users", "print", "forward"], opts);
}

export async function fetchUsersCsv(opts: GamRunOptions = {}): Promise<string> {
  // include suspended + isAdmin so the classifier can apply exemptions;
  // recoveryEmail is the user-configured personal address tied to the
  // Workspace account (separate from forwarding).
  return runGam(
    [
      "print",
      "users",
      "fields",
      "primaryEmail,givenName,familyName,suspended,isAdmin,orgUnitPath,recoveryEmail,lastLoginTime",
    ],
    opts,
  );
}

export async function fetchGroupMembersCsv(opts: GamRunOptions = {}): Promise<string> {
  // CSV with one row per (group, member). We aggregate to member->groups[]
  // in the parser. Type filter excludes nested groups/service accounts.
  return runGam(["print", "group-members", "types", "user", "fields", "group,email"], opts);
}

export async function fetchGmailReportCsv(opts: GamRunOptions = {}): Promise<string> {
  // Admin Reports API: when did each user actually interact with Gmail
  // (read/click/reply — not just background sync). Daily granularity, ~3
  // day lag. Per ADR-0014.
  return runGam(
    ["report", "users", "parameters", "gmail:last_interaction_time"],
    opts,
  );
}

export async function readFileOrEmpty(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  return await readFile(path, "utf8");
}
