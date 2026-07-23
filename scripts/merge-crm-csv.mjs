#!/usr/bin/env node
// Merges the roster CSV the CRM has historically ingested (primaryEmail,
// name, fullName, suspended, organizations) with the audit's own richer CSV
// report, keyed on primaryEmail. Column-name generic on purpose: GAM flattens
// repeated fields like `organizations` into a variable number of dotted
// columns (organizations.0.title, organizations.1.department, ...), so this
// doesn't try to model that shape — it just carries whatever columns are
// present in the roster CSV through, minus any already in the audit CSV.
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

const [, , rosterCsvPath, auditCsvPath, outPath] = process.argv;
if (!rosterCsvPath || !auditCsvPath || !outPath) {
  console.error("usage: merge-crm-csv.mjs <roster.csv> <audit.csv> <out.csv>");
  process.exit(1);
}

function parseCsv(text) {
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

const rosterRows = parseCsv(await readFile(rosterCsvPath, "utf8"));
const auditRows = parseCsv(await readFile(auditCsvPath, "utf8"));

const rosterByEmail = new Map();
for (const row of rosterRows) {
  if (row.primaryEmail) rosterByEmail.set(row.primaryEmail.toLowerCase(), row);
}

const auditColumns = auditRows.length > 0 ? Object.keys(auditRows[0]) : [];
const rosterColumns = rosterRows.length > 0 ? Object.keys(rosterRows[0]) : [];
const extraColumns = rosterColumns.filter((c) => c !== "primaryEmail" && !auditColumns.includes(c));
const allColumns = [...auditColumns, ...extraColumns];

const merged = auditRows.map((row) => {
  const rosterRow = row.primaryEmail ? rosterByEmail.get(row.primaryEmail.toLowerCase()) : undefined;
  const out = { ...row };
  for (const col of extraColumns) out[col] = rosterRow?.[col] ?? "";
  return out;
});

await writeFile(outPath, stringify(merged, { header: true, columns: allColumns }));
console.log(`merged ${merged.length} rows -> ${outPath} (${allColumns.length} columns)`);
