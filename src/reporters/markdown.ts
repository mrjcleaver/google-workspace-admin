import { writeFile } from "node:fs/promises";
import type { AuditResult } from "../types.js";

export function toMarkdown(result: AuditResult): string {
  const { summary, records } = result;
  const nonCompliant = records.filter((r) => r.status === "non-compliant");
  const invalid = records.filter((r) => r.status === "invalid");
  const unreachable = records.filter((r) => r.unreachable);

  const lines: string[] = [];
  lines.push(`# Google Workspace Forwarding Compliance Report`);
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`| ------ | ----- |`);
  lines.push(`| Total users | ${summary.totalUsers} |`);
  lines.push(`| Compliant | ${summary.compliant} |`);
  lines.push(`| Non-compliant | ${summary.nonCompliant} |`);
  lines.push(`| Invalid forwarding | ${summary.invalid} |`);
  lines.push(`| Exempt | ${summary.exempt} |`);
  lines.push(`| Unreachable (dormant + no forwarding) | ${summary.unreachable} |`);
  lines.push(`| Compliance % (evaluable users) | ${summary.compliancePct}% |`);
  lines.push("");

  if (nonCompliant.length > 0) {
    lines.push(`## Non-compliant users (${nonCompliant.length})`);
    lines.push("");
    lines.push(`| User | Recovery | Groups | Reason |`);
    lines.push(`| ---- | -------- | ------ | ------ |`);
    for (const r of nonCompliant) {
      lines.push(
        `| ${r.primaryEmail} | ${r.recoveryEmail || "—"} | ${r.groups.join(", ") || "—"} | ${r.reason} |`,
      );
    }
    lines.push("");
  }

  if (invalid.length > 0) {
    lines.push(`## Invalid forwarding (${invalid.length})`);
    lines.push("");
    lines.push(`| User | Forwarding | Recovery | Groups | Reason |`);
    lines.push(`| ---- | ---------- | -------- | ------ | ------ |`);
    for (const r of invalid) {
      const fwd = r.forwardingAddresses.map((f) => f.forwardingAddress).join(", ");
      lines.push(
        `| ${r.primaryEmail} | ${fwd} | ${r.recoveryEmail || "—"} | ${r.groups.join(", ") || "—"} | ${r.reason} |`,
      );
    }
    lines.push("");
  }

  if (unreachable.length > 0) {
    lines.push(`## Unreachable (${unreachable.length})`);
    lines.push("");
    lines.push(`Dormant accounts with no working forwarding — mail sent here does not reach anyone.`);
    lines.push("");
    lines.push(`| User | Last login | Recovery |`);
    lines.push(`| ---- | ---------- | -------- |`);
    for (const r of unreachable) {
      const since = r.daysSinceLogin === -1 ? "never" : `${r.daysSinceLogin}d ago`;
      lines.push(`| ${r.primaryEmail} | ${since} | ${r.recoveryEmail || "—"} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeMarkdownReport(result: AuditResult, path: string): Promise<void> {
  await writeFile(path, toMarkdown(result), "utf8");
}
