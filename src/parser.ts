import { parse } from "csv-parse/sync";
import type { ForwardingEntry, UserRecord } from "./types.js";

/**
 * Pick the first matching column from a row, case-insensitive, ignoring dots/spaces.
 * GAM column names vary across versions (e.g. "User" vs "primaryEmail",
 * "forwardingEmail" vs "forwardingAddress").
 */
function pick(row: Record<string, string>, candidates: string[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[\s._]/g, "");
  const map = new Map<string, string>();
  for (const k of Object.keys(row)) map.set(norm(k), row[k]);
  for (const c of candidates) {
    const v = map.get(norm(c));
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (["true", "yes", "1", "on", "enabled"].includes(s)) return true;
  if (["false", "no", "0", "off", "disabled"].includes(s)) return false;
  return undefined;
}

/**
 * GAM's verificationStatus is a string like "accepted" or "pending" — only
 * "accepted" should be treated as verified; everything else (pending, expired,
 * etc.) is explicitly *not* verified, not unknown.
 */
function parseVerified(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (s === "") return undefined;
  if (s === "accepted" || s === "verified" || s === "true") return true;
  // Fall back to generic bool parsing for column variants that are real booleans
  const b = parseBool(v);
  if (b !== undefined) return b;
  return false;
}

export function parseForwardingCsv(csv: string): ForwardingEntry[] & { __byUser: Map<string, ForwardingEntry[]> } {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const byUser = new Map<string, ForwardingEntry[]>();
  const all: ForwardingEntry[] = [];

  for (const row of rows) {
    const user = pick(row, ["User", "primaryEmail", "userEmail", "email"]);
    if (!user) continue;
    const addr = pick(row, [
      "forwardingEmail",
      "forwardingAddress",
      "forwardTo",
      "forwarding",
      "forwardingaddresses.forwardingEmail",
    ]);
    if (!addr) continue;
    const entry: ForwardingEntry = {
      forwardingAddress: addr,
      verified: parseVerified(pick(row, ["verificationStatus", "verified", "forwardingaddresses.verificationStatus"])),
      disposition: pick(row, ["disposition", "forwardingaddresses.disposition"]),
      enabled: parseBool(pick(row, ["enabled", "forwardingEnabled"])),
    };
    all.push(entry);
    const list = byUser.get(user.toLowerCase()) ?? [];
    list.push(entry);
    byUser.set(user.toLowerCase(), list);
  }

  return Object.assign(all, { __byUser: byUser });
}

export function parseUsersCsv(csv: string): UserRecord[] {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const users: UserRecord[] = [];
  for (const row of rows) {
    const email = pick(row, ["primaryEmail", "User", "email"]);
    if (!email) continue;
    users.push({
      primaryEmail: email,
      isAdmin: parseBool(pick(row, ["isAdmin", "admin"])),
      isSuspended: parseBool(pick(row, ["suspended", "isSuspended"])),
      orgUnitPath: pick(row, ["orgUnitPath", "ou"]),
    });
  }
  return users;
}

export function groupForwardingByUser(
  entries: ReturnType<typeof parseForwardingCsv>,
): Map<string, ForwardingEntry[]> {
  return entries.__byUser;
}
