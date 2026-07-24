import { stringify } from "csv-stringify/sync";
import { writeFile } from "node:fs/promises";
import type { AuditResult } from "../types.js";

export function toCsv(result: AuditResult): string {
  const rows = result.records.map((r) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    primaryEmail: r.primaryEmail,
    recoveryEmail: r.recoveryEmail,
    daysSinceLogin: r.daysSinceLogin === -1 ? "never" : r.daysSinceLogin,
    groups: r.groups.join("; "),
    forwarding_status: r.status,
    forwarding_reason: r.reason,
    organization: r.organization,
    forwardingAddresses: r.forwardingAddresses.map((f) => f.forwardingAddress).join("; "),
    verified: r.forwardingAddresses.map((f) => f.verified ?? "").join("; "),
    forwarding_disposition: r.forwardingAddresses.map((f) => f.disposition ?? "").join("; "),
    lastLoginTime: r.lastLoginTime,
    forwarding_unreachable: r.unreachable,
    isAdmin: r.isAdmin,
    isSuspended: r.isSuspended,
    lastChecked: r.lastChecked,
    workspaceId: r.workspaceId,
  }));
  return stringify(rows, { header: true });
}

export async function writeCsvReport(result: AuditResult, path: string): Promise<void> {
  await writeFile(path, toCsv(result), "utf8");
}
