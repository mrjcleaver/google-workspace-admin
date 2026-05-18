# 0015 — Reject Admin Reports API data as a reachability signal

**Status:** Accepted
**Date:** 2026-05-18
**Supersedes:** [ADR-0014](0014-gmail-last-interaction-time.md)

## Context

[ADR-0014](0014-gmail-last-interaction-time.md) added
`gmailLastInteractionTime` and `daysSinceGmail` columns sourced from
the Admin Reports API as a triage aid. Within minutes of shipping the
data to the live audit sheet, the columns were judged "very incorrect"
by the operator (Martin) and removed.

Concrete problems observed on the live data:

- **Lag:** the most recent report for the domain was dated 2026-04-28
  while the audit ran on 2026-05-18 — a 20-day staleness window. Even
  Google's own docs assume daily availability with a 1-3 day lag; in
  practice the data is far older. Numbers in `daysSinceGmail` were
  thus systematically inflated and inconsistent with the directory
  `lastLoginTime` values.
- **Coverage gaps:** of 23 root-OU users, 11 had no report row at all.
  The audit's blank cell could mean "no recent Gmail activity" or "no
  report data available" — the column couldn't distinguish.
- **Disagreement with reality:** users actively reading Gmail showed
  up as "interacted weeks ago" because the report window hadn't
  rolled forward. Putting an unreliable number side-by-side with the
  reliable `daysSinceLogin` invites the wrong column to be trusted.

The triage-aid framing from ADR-0014 was theoretically defensible —
"two signals, look at disagreements" — but in practice anyone looking
at the sheet sees two timestamp columns and assumes both are
authoritative. The friction of teaching readers "trust column A,
discount column B" exceeds the marginal triage value.

## Decision

Remove the `gmailLastInteractionTime` and `daysSinceGmail` columns
from CSV, Sheets, and the underlying data model. Remove
`fetchGmailReportCsv` / `parseGmailReportCsv` / `fetchGmailReportBestEffort`
from the code. Remove `admin.reports.usage.readonly` from the
required DwD scope list (CI scope-check, README), since nothing else
in the audit needs it.

Reachability stays a single-signal model: directory `lastLoginTime`
(per ADR-0009) is the only reachability input. ADR-0011 (active users
compliant without forwarding) continues unchanged — it referenced
`daysSinceLogin` already, not the rejected column.

The Admin Reports API itself is not blacklisted — a future ADR could
revisit if either Google's data freshness improves or a use case
appears where a known-stale-up-to-N-days signal is acceptable. Today
the cost of two confused columns outweighs the benefit.

## Consequences

- **Positive:** One reachability column to look at. No reader has to
  remember which timestamp is authoritative.
- **Positive:** Drops a DwD scope, narrowing the SA's blast radius.
- **Positive:** Drops a per-run API call.
- **Negative:** Loses the "logs into Calendar but ignores Gmail" case
  ADR-0014 was meant to catch. Accepted — `lastLoginTime` will still
  catch genuinely dormant accounts and the marginal cases weren't
  surfaced reliably anyway.
- **Negative:** The 0014 → 0015 round-trip is visible in the ADR
  history. That's the system working as intended — ADRs are meant to
  record decisions including the ones we walk back from.
- **Negative:** Reverts ADR-0009's "deferred to a future ADR" stance
  for Gmail-specific data back to "deferred until a real need
  arises." Documented but not advertised.
