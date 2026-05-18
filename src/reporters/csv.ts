import { stringify } from "csv-stringify/sync";
import { writeFile } from "node:fs/promises";
import type { AuditResult } from "../types.js";

export function toCsv(result: AuditResult): string {
  const rows = result.records.map((r) => ({
    primaryEmail: r.primaryEmail,
    firstName: r.firstName,
    lastName: r.lastName,
    organization: r.organization,
    status: r.status,
    reason: r.reason,
    forwardingAddresses: r.forwardingAddresses.map((f) => f.forwardingAddress).join("; "),
    verified: r.forwardingAddresses.map((f) => f.verified ?? "").join("; "),
    disposition: r.forwardingAddresses.map((f) => f.disposition ?? "").join("; "),
    recoveryEmail: r.recoveryEmail,
    groups: r.groups.join("; "),
    lastLoginTime: r.lastLoginTime,
    daysSinceLogin: r.daysSinceLogin === -1 ? "never" : r.daysSinceLogin,
    unreachable: r.unreachable,
    isAdmin: r.isAdmin,
    isSuspended: r.isSuspended,
    lastChecked: r.lastChecked,
  }));
  return stringify(rows, { header: true });
}

export async function writeCsvReport(result: AuditResult, path: string): Promise<void> {
  await writeFile(path, toCsv(result), "utf8");
}
