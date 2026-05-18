import { writeFile } from "node:fs/promises";
import type { AuditResult } from "../types.js";

export function toMarkdown(result: AuditResult): string {
  const { summary, records } = result;
  const nonCompliant = records.filter((r) => r.status === "non-compliant");
  const invalid = records.filter((r) => r.status === "invalid");

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

  return lines.join("\n");
}

export async function writeMarkdownReport(result: AuditResult, path: string): Promise<void> {
  await writeFile(path, toMarkdown(result), "utf8");
}
