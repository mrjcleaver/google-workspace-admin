# 0010 — Default audit scope: root OU only

**Status:** Accepted
**Date:** 2026-05-18

## Context

The Workspace org for `guelphrobotics.ca` has 45 user accounts split
across multiple OUs:

```
/                                    (23 — real volunteer accounts)
/Service Accounts                    (6 — <integration users>, ...)
/RCCR Shared Accounts                (2 — <shared functional mailboxes>)
/FRC 2609 - Beaverworx               (7 — team admin accounts)
/FRC 2609 - Beaverworx/FRC 2609 - Students  (6 — <student-pool accounts>)
/FRC 11227 - Goose Goose Duck        (1 — <team media account>)
```

The forwarding compliance audit is concerned with **human volunteers**
whose mail needs to reach a working inbox. Service accounts (OAuth
intermediaries, integration users) don't have humans behind them;
team/shared accounts have their own lifecycle managed outside this audit;
student accounts have a separate parental-contact path.

Running the audit against all 45 surfaces a flood of false positives —
service accounts will never have forwarding by design.

## Decision

The audit defaults to **only users at `orgUnitPath = "/"` (the root OU)**.
Sub-OU users are filtered out *before* classification — they never appear
in the report counts, the CSV, the Sheet, or the unreachable list.

Opt-in flag: `--include-sub-ous` restores the all-users behavior. The
filter is applied in `src/index.ts` between parsing and classification;
it does not change the underlying GAM fetch (we still pull all users so
the dump CSVs remain complete for ad-hoc analysis).

The separate `--full-org-path` flag (introduced earlier in the same
session) controls **column rendering** for users who ARE in the report:
when `--include-sub-ous` widens the audit set, `--full-org-path`
controls whether the `organization` column shows
`/FRC 2609 - Beaverworx/FRC 2609 - Students` or just
`FRC 2609 - Beaverworx`. The two flags are independent: a user might
want sub-OU users included but rolled up to top-level (e.g., for
team-level reporting).

Forwarding-only mode (no `--users-input`) has no OU data and the filter
is a no-op — the audit warns nothing and reports on whatever the
forwarding CSV contains.

## Consequences

- **Positive:** Default run produces actionable output (23 of 45 users)
  matching the real intent — "are our human volunteers reachable?"
- **Positive:** Service-account noise doesn't crowd out genuine
  compliance issues in the report.
- **Positive:** The two OU flags compose cleanly (filter, then render).
- **Negative:** Anyone reorganizing volunteers into a sub-OU (a likely
  future move as the org grows) will silently disappear from the audit
  until `--include-sub-ous` is added or the OU is moved back. Mitigation:
  the stderr log line `filtered to root OU only: N of M users` makes the
  filter visible on every run.
- **Negative:** Two orthogonal flags is more surface than one. Rejected
  the alternative of a single `--ou-mode {root|all|full}` because the
  user filter and the column rendering are genuinely independent
  concerns and a single knob couldn't express e.g. "include sub-OUs but
  collapse the column to top-level."
