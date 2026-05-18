# 0002 — Use GAM7 as the Workspace integration layer

**Status:** Accepted
**Date:** 2026-05-14

## Context

The audit needs two things from Google Workspace:

1. Enumerate users (with admin/suspended flags) — Admin Directory API.
2. Read each user's Gmail auto-forwarding setting — Gmail Settings API, which
   requires impersonating the user via domain-wide delegation.

There are three realistic ways to do this:

| Option | What it is |
| ------ | ---------- |
| **GAM7** (shell-out) | The community admin tool already in operational use. Wraps both APIs, handles DWD, ships its own auth code path. |
| **Direct API client** | Talk to Admin SDK + Gmail API ourselves via `googleapis` (Node) or equivalent. Implement DWD JWT signing ourselves. |
| **Admin SDK Reports API** | Has some audit-style data but does not expose per-user Gmail forwarding configuration. Not viable. |

GAM7 is already the user's day-to-day Workspace admin tool. It owns the
keyless WIF auth knowledge (see [ADR-0003](0003-workload-identity-federation-for-ci-auth.md)),
the DWD JWT signing, and the CSV-from-the-API semantics. Re-implementing
that in this repo would be a non-trivial amount of code for a Phase 1 MVP
that runs weekly against ~45 users.

## Decision

Shell out to the `gam` binary. Implementation in `src/gam.ts`:

- `gam all users print forward` → per-user forwarding state (CSV).
- `gam print users fields primaryEmail,suspended,isAdmin,orgUnitPath` →
  user roster (CSV).

The TypeScript code parses the CSVs with `csv-parse` and is responsible
for compliance classification. Auth (admin OAuth + WIF + DWD) is fully
GAM7's responsibility.

`GAM_PATH` env var allows overriding the binary location.

## Consequences

- **Positive:** No DWD-JWT code in this repo. GAM7 already handles the
  signjwt-via-WIF gymnastics (see [ADR-0003](0003-workload-identity-federation-for-ci-auth.md)).
- **Positive:** Local debugging mirrors what an admin would do at the
  shell anyway — `gam all users print forward > out.csv` is a valid
  reproduction step.
- **Positive:** GAM7 is mature and maintained. Bug fixes upstream propagate
  to us by reinstalling.
- **Negative:** Adds a Python+pyinstaller runtime dependency to any
  environment that runs the audit live. CI workflow installs GAM7 fresh
  each run.
- **Negative:** Output is CSV with column variations between GAM versions.
  Parser is tolerant of column-name variants (`User` vs `primaryEmail`,
  `forwardingEmail` vs `forwardTo`); tests in `test/parser.test.ts` exercise
  this.
- **Negative:** Error surface is GAM's stdout/stderr strings, not typed
  API errors. A failed call gives us `gam exited 16: ERROR: ...` and we
  surface it as-is.
