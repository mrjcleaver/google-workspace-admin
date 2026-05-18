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
    // GAM emits `1970-01-01T00:00:00.000Z` as the sentinel for "never logged
    // in" — treat that exactly the same as a missing column.
    const rawLogin = pick(row, ["lastLoginTime", "lastLogin"]);
    const lastLoginTime =
      rawLogin && !rawLogin.startsWith("1970-01-01") ? rawLogin : undefined;
    users.push({
      primaryEmail: email,
      isAdmin: parseBool(pick(row, ["isAdmin", "admin"])),
      isSuspended: parseBool(pick(row, ["suspended", "isSuspended"])),
      orgUnitPath: pick(row, ["orgUnitPath", "ou"]),
      recoveryEmail: pick(row, ["recoveryEmail", "recovery"]),
      lastLoginTime,
    });
  }
  return users;
}

/**
 * Parse `gam print group-members` CSV into a map of member-email -> list of
 * group emails they belong to. Case-folded on the member side so it joins
 * cleanly with primaryEmail lookups.
 */
export function parseGroupMembersCsv(csv: string): Map<string, string[]> {
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const byMember = new Map<string, string[]>();
  for (const row of rows) {
    const group = pick(row, ["group", "groupEmail", "Group"]);
    const member = pick(row, ["email", "memberEmail", "primaryEmail"]);
    if (!group || !member) continue;
    const key = member.toLowerCase();
    const list = byMember.get(key) ?? [];
    if (!list.includes(group)) list.push(group);
    byMember.set(key, list);
  }
  return byMember;
}

export function groupForwardingByUser(
  entries: ReturnType<typeof parseForwardingCsv>,
): Map<string, ForwardingEntry[]> {
  return entries.__byUser;
}
