import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseForwardingCsv, parseUsersCsv, groupForwardingByUser } from "../src/parser.js";
import { classifyAll } from "../src/compliance.js";

const FIX = join(process.cwd(), "fixtures");

function setup() {
  const fwd = parseForwardingCsv(readFileSync(join(FIX, "forwarding-sample.csv"), "utf8"));
  const users = parseUsersCsv(readFileSync(join(FIX, "users-sample.csv"), "utf8"));
  return { fwd: groupForwardingByUser(fwd), users };
}

test("classifies users with verified forwarding as compliant", () => {
  const { fwd, users } = setup();
  const result = classifyAll(users, fwd, { exemptAdmins: true, exemptSuspended: true });
  const alice = result.records.find((r) => r.primaryEmail === "alice@volunteers.example.org");
  assert.equal(alice?.status, "compliant");
});

test("classifies users with no forwarding as non-compliant", () => {
  const { fwd, users } = setup();
  const result = classifyAll(users, fwd, { exemptAdmins: true, exemptSuspended: true });
  const dave = result.records.find((r) => r.primaryEmail === "dave@volunteers.example.org");
  assert.equal(dave?.status, "non-compliant");
});

test("exempts admins and suspended users when requested", () => {
  const { fwd, users } = setup();
  const result = classifyAll(users, fwd, { exemptAdmins: true, exemptSuspended: true });
  const admin = result.records.find((r) => r.primaryEmail === "admin@volunteers.example.org");
  const erin = result.records.find((r) => r.primaryEmail === "erin@volunteers.example.org");
  assert.equal(admin?.status, "exempt");
  assert.equal(erin?.status, "exempt");
});

test("flags unverified forwarding as invalid", () => {
  const { fwd, users } = setup();
  const result = classifyAll(users, fwd, { exemptAdmins: true, exemptSuspended: true });
  const bob = result.records.find((r) => r.primaryEmail === "bob@volunteers.example.org");
  assert.equal(bob?.status, "invalid");
  assert.match(bob!.reason, /not verified/);
});

test("flags forwarding to disallowed domain as invalid", () => {
  const { fwd, users } = setup();
  const result = classifyAll(users, fwd, {
    allowedDomains: ["gmail.com"],
    exemptAdmins: true,
    exemptSuspended: true,
  });
  const carol = result.records.find((r) => r.primaryEmail === "carol@volunteers.example.org");
  assert.equal(carol?.status, "invalid");
  assert.match(carol!.reason, /domain not allowed/);
});

test("summary stats match record classification", () => {
  const { fwd, users } = setup();
  const result = classifyAll(users, fwd, { exemptAdmins: true, exemptSuspended: true });
  const { summary } = result;
  assert.equal(summary.totalUsers, 6);
  assert.equal(summary.exempt, 2); // admin + erin (suspended)
  assert.equal(summary.compliant + summary.nonCompliant + summary.invalid + summary.exempt, 6);
});
