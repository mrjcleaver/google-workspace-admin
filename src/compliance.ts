import type {
  AuditRecord,
  AuditResult,
  AuditSummary,
  ComplianceOptions,
  ComplianceStatus,
  ForwardingEntry,
  UserRecord,
} from "./types.js";

function domainOf(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

function classify(
  user: UserRecord,
  fwd: ForwardingEntry[],
  daysSinceLogin: number,
  opts: ComplianceOptions,
): { status: ComplianceStatus; reason: string } {
  if (opts.exemptAdmins && user.isAdmin) return { status: "exempt", reason: "admin user" };
  if (opts.exemptSuspended && user.isSuspended) return { status: "exempt", reason: "suspended user" };

  // Active users are reachable by definition — forwarding is irrelevant to
  // them. ADR-0011 supersedes ADR-0006: compliance follows reachability, not
  // configuration. Note: this intentionally does NOT downgrade invalid/broken
  // forwarding to "compliant" for active users — broken-but-active is still
  // worth surfacing so the user can clean up stale rules.
  const threshold = opts.unreachableAfterDays ?? 90;
  const active = daysSinceLogin >= 0 && daysSinceLogin <= threshold;

  if (fwd.length === 0) {
    if (active) return { status: "compliant", reason: `active user (logged in ${daysSinceLogin}d ago)` };
    return { status: "non-compliant", reason: "no forwarding address configured" };
  }

  const allowed = (opts.allowedDomains ?? []).map((d) => d.toLowerCase().replace(/^@/, ""));
  const problems: string[] = [];
  let anyVerified = false;
  for (const entry of fwd) {
    if (entry.verified === false) problems.push(`${entry.forwardingAddress} not verified`);
    if (entry.verified === true) anyVerified = true;
    if (allowed.length > 0) {
      const d = domainOf(entry.forwardingAddress);
      if (d && !allowed.includes(d)) problems.push(`${entry.forwardingAddress} domain not allowed`);
    }
  }

  if (problems.length > 0) return { status: "invalid", reason: problems.join("; ") };
  // If verification info was missing entirely, treat as compliant but note it.
  return {
    status: "compliant",
    reason: anyVerified ? "forwarding verified" : "forwarding configured",
  };
}

/**
 * "/" → "" (root OU, no useful org info);
 * "/Foo" → "Foo";
 * "/Foo/Bar" → "Foo" (unless fullPath is set, in which case the leading
 * slash is dropped but the rest is preserved).
 */
function deriveOrganization(orgUnitPath: string | undefined, fullPath: boolean): string {
  if (!orgUnitPath || orgUnitPath === "/") return "";
  const trimmed = orgUnitPath.replace(/^\//, "");
  if (fullPath) return trimmed;
  const slash = trimmed.indexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(0, slash);
}

/**
 * Returns -1 if the user has never logged in (sentinel for "never"); the
 * sheet/markdown reporters render this as the string "never".
 */
function computeDaysSinceLogin(lastLoginTime: string | undefined, nowMs: number): number {
  if (!lastLoginTime) return -1;
  const t = Date.parse(lastLoginTime);
  if (!Number.isFinite(t)) return -1;
  return Math.floor((nowMs - t) / 86_400_000);
}

/**
 * "Could mail sent to this user actually reach anyone?" Dormant on its own
 * isn't unreachable — if forwarding is set up to a verified personal address,
 * mail still gets through. So `unreachable` is the *intersection*: dormant
 * AND no working forwarding. Suspended users are unreachable by definition.
 */
function isUnreachable(
  user: UserRecord,
  fwd: ForwardingEntry[],
  daysSinceLogin: number,
  threshold: number,
): boolean {
  if (user.isSuspended) return true;
  const dormant = daysSinceLogin === -1 || daysSinceLogin >= threshold;
  if (!dormant) return false;
  const hasWorkingForwarding = fwd.some(
    (e) => e.verified !== false && e.enabled !== false,
  );
  return !hasWorkingForwarding;
}

export function classifyAll(
  users: UserRecord[],
  forwardingByUser: Map<string, ForwardingEntry[]>,
  opts: ComplianceOptions = {},
  groupsByUser: Map<string, string[]> = new Map(),
): AuditResult {
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const threshold = opts.unreachableAfterDays ?? 90;
  const records: AuditRecord[] = users.map((u) => {
    const fwd = forwardingByUser.get(u.primaryEmail.toLowerCase()) ?? [];
    const daysSinceLogin = computeDaysSinceLogin(u.lastLoginTime, nowMs);
    const { status, reason } = classify(u, fwd, daysSinceLogin, opts);
    return {
      primaryEmail: u.primaryEmail,
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      organization: deriveOrganization(u.orgUnitPath, opts.fullOrgPath ?? false),
      isAdmin: u.isAdmin ?? false,
      isSuspended: u.isSuspended ?? false,
      forwardingAddresses: fwd,
      recoveryEmail: u.recoveryEmail ?? "",
      groups: u.groups ?? groupsByUser.get(u.primaryEmail.toLowerCase()) ?? [],
      lastLoginTime: u.lastLoginTime ?? "",
      daysSinceLogin,
      unreachable: isUnreachable(u, fwd, daysSinceLogin, threshold),
      status,
      reason,
      lastChecked: now,
    };
  });
  return { records, summary: summarize(records, now) };
}

/**
 * Forwarding-only mode: no users CSV available. We can only report on users
 * that GAM returned forwarding entries for — non-compliant users are invisible.
 */
export function classifyFromForwardingOnly(
  forwardingByUser: Map<string, ForwardingEntry[]>,
  opts: ComplianceOptions = {},
  groupsByUser: Map<string, string[]> = new Map(),
): AuditResult {
  const users: UserRecord[] = [...forwardingByUser.keys()].map((e) => ({ primaryEmail: e }));
  return classifyAll(users, forwardingByUser, opts, groupsByUser);
}

function summarize(records: AuditRecord[], generatedAt: string): AuditSummary {
  let compliant = 0,
    nonCompliant = 0,
    invalid = 0,
    exempt = 0,
    unreachable = 0;
  for (const r of records) {
    if (r.status === "compliant") compliant++;
    else if (r.status === "non-compliant") nonCompliant++;
    else if (r.status === "invalid") invalid++;
    else if (r.status === "exempt") exempt++;
    if (r.unreachable) unreachable++;
  }
  const evaluable = compliant + nonCompliant + invalid;
  return {
    totalUsers: records.length,
    compliant,
    nonCompliant,
    invalid,
    exempt,
    unreachable,
    compliancePct: evaluable === 0 ? 0 : Math.round((compliant / evaluable) * 1000) / 10,
    generatedAt,
  };
}
