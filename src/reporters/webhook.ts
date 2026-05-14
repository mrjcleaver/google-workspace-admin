import type { AuditResult } from "../types.js";

export type WebhookFlavor = "slack" | "discord" | "auto";

export function detectFlavor(url: string): Exclude<WebhookFlavor, "auto"> {
  if (/discord(app)?\.com\//i.test(url)) return "discord";
  return "slack";
}

export function buildSummaryText(result: AuditResult): string {
  const s = result.summary;
  const lines = [
    `*Forwarding compliance audit* — ${s.compliancePct}% compliant`,
    `Total: ${s.totalUsers} · Compliant: ${s.compliant} · Non-compliant: ${s.nonCompliant} · Invalid: ${s.invalid} · Exempt: ${s.exempt}`,
  ];
  const noFwd = result.records.filter((r) => r.status === "non-compliant").slice(0, 10);
  if (noFwd.length > 0) {
    lines.push("");
    lines.push("Top non-compliant users:");
    for (const r of noFwd) lines.push(`• ${r.primaryEmail}`);
    if (s.nonCompliant > noFwd.length) lines.push(`…and ${s.nonCompliant - noFwd.length} more`);
  }
  return lines.join("\n");
}

export async function postWebhook(
  url: string,
  result: AuditResult,
  flavor: WebhookFlavor = "auto",
): Promise<void> {
  const resolved = flavor === "auto" ? detectFlavor(url) : flavor;
  const text = buildSummaryText(result);
  const body = resolved === "discord" ? { content: text } : { text };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`webhook POST ${res.status}: ${detail}`);
  }
}
