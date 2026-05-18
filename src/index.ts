#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs, helpText } from "./cli.js";
import { fetchForwardingCsv, fetchGroupMembersCsv, fetchUsersCsv, readFileOrEmpty } from "./gam.js";
import { parseForwardingCsv, parseGroupMembersCsv, parseUsersCsv, groupForwardingByUser } from "./parser.js";
import { classifyAll, classifyFromForwardingOnly } from "./compliance.js";
import { writeCsvReport } from "./reporters/csv.js";
import { writeMarkdownReport, toMarkdown } from "./reporters/markdown.js";
import { postWebhook } from "./reporters/webhook.js";
import { writeSheetsReport } from "./reporters/sheets.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }

  // 1. Get input CSVs (file or GAM)
  const forwardingCsv =
    (await readFileOrEmpty(args.forwardingInput)) ?? (await fetchForwardingCsv());
  const usersCsv = args.usersInput
    ? await readFileOrEmpty(args.usersInput)
    : args.forwardingInput
      ? undefined // forwarding-only mode when input file is provided without users
      : await fetchUsersCsv();

  // 2. Parse + classify. Group membership is best-effort: if the SA lacks
  // directory.group.readonly we skip it rather than fail the audit.
  const fwd = parseForwardingCsv(forwardingCsv);
  const byUser = groupForwardingByUser(fwd);
  const groupsByUser = await fetchGroupsBestEffort();
  const opts = {
    allowedDomains: args.allowedDomains,
    exemptAdmins: args.exemptAdmins,
    exemptSuspended: args.exemptSuspended,
    unreachableAfterDays: args.unreachableAfterDays,
    fullOrgPath: args.fullOrgPath,
  };
  // By default the audit only covers users at the root OU `/`. Sub-OU users
  // (service accounts, sub-team accounts) are excluded unless --include-sub-ous
  // is set. Forwarding-only mode has no OU data, so the filter is a no-op there.
  let users = usersCsv ? parseUsersCsv(usersCsv) : undefined;
  if (users && !args.includeSubOus) {
    const before = users.length;
    users = users.filter((u) => !u.orgUnitPath || u.orgUnitPath === "/");
    process.stderr.write(
      `filtered to root OU only: ${users.length} of ${before} users (use --include-sub-ous to keep sub-OU users)\n`,
    );
  }
  const result = users
    ? classifyAll(users, byUser, opts, groupsByUser)
    : classifyFromForwardingOnly(byUser, opts, groupsByUser);

  // 3. Always print markdown summary to stdout so logs are useful
  process.stdout.write(toMarkdown(result) + "\n");

  if (args.dryRun) return;

  // 4. Write files
  await mkdir(args.outDir, { recursive: true });
  const csvPath = args.csvOut ?? join(args.outDir, "forwarding-audit.csv");
  const mdPath = args.markdownOut ?? join(args.outDir, "forwarding-audit.md");
  await writeCsvReport(result, csvPath);
  await writeMarkdownReport(result, mdPath);
  process.stderr.write(`wrote ${csvPath}\nwrote ${mdPath}\n`);

  // 5. Optional Sheets
  if (args.sheetId) {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    await writeSheetsReport(result, {
      spreadsheetId: args.sheetId,
      sheetName: args.sheetName,
      credentialsJson,
    });
    process.stderr.write(`wrote Google Sheet ${args.sheetId}\n`);
  }

  // 6. Optional webhook
  if (args.webhook) {
    await postWebhook(args.webhook, result, args.webhookFlavor);
    process.stderr.write(`posted webhook\n`);
  }
}

async function fetchGroupsBestEffort(): Promise<Map<string, string[]>> {
  try {
    return parseGroupMembersCsv(await fetchGroupMembersCsv());
  } catch (e) {
    process.stderr.write(
      `warn: skipping groups column (${e instanceof Error ? e.message : String(e)})\n`,
    );
    return new Map();
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
