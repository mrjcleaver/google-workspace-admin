import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli.js";

test("parses basic flags", () => {
  const a = parseArgs([
    "--forwarding-input",
    "f.csv",
    "--users-input",
    "u.csv",
    "--out-dir",
    "out2",
    "--allowed-domain",
    "gmail.com",
    "--allowed-domain",
    "outlook.com",
    "--no-exempt-admins",
  ]);
  assert.equal(a.forwardingInput, "f.csv");
  assert.equal(a.usersInput, "u.csv");
  assert.equal(a.outDir, "out2");
  assert.deepEqual(a.allowedDomains, ["gmail.com", "outlook.com"]);
  assert.equal(a.exemptAdmins, false);
});

test("defaults sensibly", () => {
  const a = parseArgs([]);
  assert.equal(a.outDir, "out");
  assert.equal(a.webhookFlavor, "auto");
  assert.equal(a.exemptAdmins, true);
  assert.equal(a.exemptSuspended, true);
});

test("rejects unknown flag", () => {
  assert.throws(() => parseArgs(["--no-such-flag"]));
});

test("rejects bad webhook flavor", () => {
  assert.throws(() => parseArgs(["--webhook-flavor", "telegram"]));
});
