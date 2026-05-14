import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseForwardingCsv, parseUsersCsv, groupForwardingByUser } from "../src/parser.js";

const FIX = join(process.cwd(), "fixtures");

test("parses GAM forwardingaddresses CSV", () => {
  const csv = readFileSync(join(FIX, "forwarding-sample.csv"), "utf8");
  const entries = parseForwardingCsv(csv);
  assert.equal(entries.length, 4);
  const alice = entries.find((e) => e.forwardingAddress === "alice.personal@gmail.com");
  assert.ok(alice);
  assert.equal(alice.verified, true);
  assert.equal(alice.disposition, "leaveInInbox");
  const bob = entries.find((e) => e.forwardingAddress === "bob@outlook.com");
  assert.equal(bob?.verified, false); // "pending" → not verified
});

test("groups forwarding entries by user (case-insensitive)", () => {
  const csv = readFileSync(join(FIX, "forwarding-sample.csv"), "utf8");
  const entries = parseForwardingCsv(csv);
  const by = groupForwardingByUser(entries);
  assert.equal(by.get("alice@volunteers.example.org")?.length, 1);
  assert.equal(by.get("ALICE@VOLUNTEERS.EXAMPLE.ORG".toLowerCase())?.length, 1);
});

test("parses GAM users CSV with admin/suspended flags", () => {
  const csv = readFileSync(join(FIX, "users-sample.csv"), "utf8");
  const users = parseUsersCsv(csv);
  assert.equal(users.length, 6);
  const admin = users.find((u) => u.primaryEmail === "admin@volunteers.example.org");
  assert.equal(admin?.isAdmin, true);
  const erin = users.find((u) => u.primaryEmail === "erin@volunteers.example.org");
  assert.equal(erin?.isSuspended, true);
});

test("tolerates alternative column names", () => {
  const csv = `primaryEmail,forwardingAddress\nx@example.org,y@example.org\n`;
  const entries = parseForwardingCsv(csv);
  assert.equal(entries[0].forwardingAddress, "y@example.org");
});
