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
  opts: ComplianceOptions,
): { status: ComplianceStatus; reason: string } {
  if (opts.exemptAdmins && user.isAdmin) return { status: "exempt", reason: "admin user" };
  if (opts.exemptSuspended && user.isSuspended) return { status: "exempt", reason: "suspended user" };

  if (fwd.length === 0) return { status: "non-compliant", reason: "no forwarding address configured" };

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

export function classifyAll(
  users: UserRecord[],
  forwardingByUser: Map<string, ForwardingEntry[]>,
  opts: ComplianceOptions = {},
  groupsByUser: Map<string, string[]> = new Map(),
): AuditResult {
  const now = new Date().toISOString();
  const records: AuditRecord[] = users.map((u) => {
    const fwd = forwardingByUser.get(u.primaryEmail.toLowerCase()) ?? [];
    const { status, reason } = classify(u, fwd, opts);
    return {
      primaryEmail: u.primaryEmail,
      isAdmin: u.isAdmin ?? false,
      isSuspended: u.isSuspended ?? false,
      forwardingAddresses: fwd,
      recoveryEmail: u.recoveryEmail ?? "",
      groups: u.groups ?? groupsByUser.get(u.primaryEmail.toLowerCase()) ?? [],
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
    exempt = 0;
  for (const r of records) {
    if (r.status === "compliant") compliant++;
    else if (r.status === "non-compliant") nonCompliant++;
    else if (r.status === "invalid") invalid++;
    else if (r.status === "exempt") exempt++;
  }
  const evaluable = compliant + nonCompliant + invalid;
  return {
    totalUsers: records.length,
    compliant,
    nonCompliant,
    invalid,
    exempt,
    compliancePct: evaluable === 0 ? 0 : Math.round((compliant / evaluable) * 1000) / 10,
    generatedAt,
  };
}
