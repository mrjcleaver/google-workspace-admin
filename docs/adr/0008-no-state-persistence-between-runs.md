# 0008 — No state persistence between runs

**Status:** Accepted
**Date:** 2026-05-14

## Context

PRD's Data Model includes a `lastChecked` timestamp but is silent on
retention or run-to-run comparison. PRD FR4 lists desired alerting
behaviour that *implies* state — e.g., "newly created accounts without
forwarding" and "users missing forwarding after onboarding window" can't
be detected from a single audit's output. You need to know either when
the account was created or what last week's snapshot looked like.

We could persist run history in several ways:

- Database (SQLite committed to repo, hosted Postgres, etc.).
- Append-only log file committed by CI.
- Stash CSVs in Google Drive / a Sheet that grows over time.
- Rely on GitHub workflow artifacts (retained 90 days by default).
- Nothing.

For Phase 1, none of FR4's stateful behaviours are being implemented yet.
Adding persistence speculatively means choosing a storage layer, schema
migration story, and access auth — all of which are real ongoing cost.
The volunteer-org context (~45 users, weekly cadence) doesn't justify
that.

## Decision

Each audit run is independent. No state is carried across runs by this
codebase. The `lastChecked` field in the CSV is the run's own timestamp,
not a "first observed" tracker.

Historical record lives in GitHub workflow artifacts. The default
artifact retention (90 days) is the de facto history. To go back further,
download the artifact and archive it externally.

When a Phase 2 feature actually requires comparing runs (e.g., "new
non-compliant accounts since last week"), a follow-up ADR will pick a
storage mechanism. The current best guess is "previous CSV held in the
target Google Sheet's history tab" — Sheets already has versioning and
the SA already has edit access — but that decision isn't being made now.

## Consequences

- **Positive:** Simple. The audit is a pure function of the current
  Workspace state. Easy to test, idempotent, easy to reason about.
- **Positive:** Zero state-management surface — no schema, no migration,
  no orphaned data, no GDPR-style retention to manage.
- **Negative:** FR4's "newly created" and "after onboarding window" cases
  are blocked until storage exists. They're explicitly Phase 2 in PRD,
  so this is just making the dependency explicit.
- **Negative:** Trend analysis ("compliance went from 60% to 85% over Q1")
  has to be done by hand against archived artifacts. Acceptable at
  current scale.
- **Negative:** If a coordinator wants to see "who got fixed since last
  run" they have to diff CSVs themselves. Mitigation: that workflow is
  rare enough not to justify automation yet.
