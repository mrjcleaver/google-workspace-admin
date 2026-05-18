# 0014 — Surface `gmail:last_interaction_time` from the Admin Reports API

**Status:** Accepted
**Date:** 2026-05-18
**Extends:** [ADR-0009](0009-reachability-classification.md)

## Context

[ADR-0009](0009-reachability-classification.md) chose directory
`lastLoginTime` as the dormancy signal because it was free with the
existing DwD scope set. It deferred the alternative
"Gmail-specific last-used-time via Admin Reports API" to a future ADR
on the grounds that directory data should be enough for the dormancy
decision.

On live `guelphrobotics.ca` data the two signals diverged in useful
ways:

- A user who logs into Workspace weekly for Calendar but never opens
  Gmail counts as "active" by directory standards but is effectively
  unreachable by email.
- The "improper setup" cases (never-logged-in accounts) are obvious
  in both signals, but the in-between cases (logged in 20 days ago,
  hasn't touched Gmail in 60) are exactly the people forwarding was
  designed to catch.

A privacy-light alternative — Gmail UNREAD label counts — was
considered and rejected: the snapshot is ambiguous (filters,
power-user habits), more invasive (knows how much mail the user has),
and a single snapshot doesn't carry temporal information.

## Decision

Add `gmailLastInteractionTime` and computed `daysSinceGmail` as
**informational columns** alongside the existing `lastLoginTime` /
`daysSinceLogin` pair. The new columns:

- Source: `gam report users parameters gmail:last_interaction_time`
  (Admin Reports API)
- Fetch: best-effort via `fetchGmailReportBestEffort()` in
  `src/index.ts` — if the scope or the API call fails, the audit still
  runs and the column is empty rather than failing the run
- Granularity: daily date (Reports API doesn't expose finer)
- Lag: ~3 days typical, up to ~3 weeks observed in our data — the
  report aggregation date is exposed in raw form so consumers can see
  how fresh it is
- Privacy: covers "did the user interact with mail" (read/click/reply),
  not message content or unread counts — comparable surface to login
  data

The signal does **not** change `unreachable` or compliance
classification — those remain on directory `lastLoginTime` (ADR-0009,
ADR-0011). The motivation: the Gmail signal lags too much to drive
fast-acting policy and produces empty cells for users with no recent
Gmail activity at all (currently 11 of 23 users). It's a triage aid,
not a verdict input.

New DwD scope required:
`https://www.googleapis.com/auth/admin.reports.usage.readonly`. Added
to the `gam user X check serviceaccount` scope list in the CI workflow
so missing scope fails fast. Audit also degrades gracefully if the
scope is absent — column empty, warning to stderr.

## Consequences

- **Positive:** Surfaces the "logs into Calendar but ignores Gmail"
  case that directory data can't see.
- **Positive:** Two independent signals make triage easier — when both
  say "old", the dormant call is high-confidence; when they disagree,
  it's a row worth a closer look.
- **Positive:** Adding it best-effort means the scope upgrade is
  optional — orgs that don't want to grant Reports API access can
  still run the audit with the column blank.
- **Negative:** Reports API has notoriously variable lag. Daily data
  for a user can land anywhere from 1-21 days behind. The audit's
  freshness assumption needs to be "this column may be stale".
- **Negative:** Two timestamp columns invites questions like "which
  one is right?" Documentation burden — settled in ADR by noting they
  measure different things.
- **Negative:** Empty rows for users with no Gmail activity. Sheet
  filtering by "daysSinceGmail = blank" surfaces these but the empty
  state is ambiguous (no data vs. genuinely no activity).
