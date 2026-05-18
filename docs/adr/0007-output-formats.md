# 0007 — Output formats: CSV + Markdown default, Sheets + webhook optional

**Status:** Accepted
**Date:** 2026-05-14

## Context

PRD FR2 lists CSV, Google Sheet, and Markdown as report formats. PRD FR4
adds optional notifications via email, Slack, and Discord webhooks. We
need to decide which outputs are produced by default vs. opt-in, and how
each is wired.

Constraints from the rest of the design:

- The audit runs in CI ([ADR-0003](0003-workload-identity-federation-for-ci-auth.md))
  and the codespace doesn't have credentials ([ADR-0004](0004-codespaces-do-not-authenticate.md)).
  So anything requiring extra credentials (Sheets, webhooks) has to be
  guarded by config — a default `node dist/index.js` run can't blow up
  because someone didn't configure Slack.
- The markdown summary is the most "human reads it" format and should be
  visible in CI logs without downloading the artifact.

## Decision

Every run produces two files in `out/` (configurable via `--out-dir`):

- `forwarding-audit.csv` — one row per user, all classifier fields. The
  long-term format for diffs and ingestion.
- `forwarding-audit.md` — human-readable summary with counts and lists of
  non-compliant / invalid users.

The markdown summary is **also** printed to stdout on every run so the CI
log itself shows the result without needing to download the artifact.

Optional, opt-in via flag/env:

- `--sheet-id <id>` writes the same data to a Google Sheet tab. Auth via
  Application Default Credentials (the WIF credential file in CI). The
  identity must have edit access to the sheet — share the spreadsheet
  with the SA email.
- `--webhook <url>` posts the summary to Slack or Discord. Flavor is
  auto-detected from the URL host; override with `--webhook-flavor`.
- `--dry-run` skips both the file writes and the webhook (markdown still
  goes to stdout).

No email-out is implemented (PRD FR4 mentions it; deferred until needed —
Slack/Discord cover the operational need and adding SMTP adds another
credential to manage).

## Consequences

- **Positive:** A default `node dist/index.js` (or default CI run) works
  with zero extra config beyond auth.
- **Positive:** CI logs are useful on their own; the artifact and webhook
  are upgrades, not requirements.
- **Positive:** Sheets and webhook are independent — turning one on
  doesn't require the other.
- **Negative:** "Markdown to stdout *and* to a file" is mild duplication.
  Worth it for log-readability without forcing artifact download.
- **Negative:** Sheets path requires the SA to have sheet edit access,
  which is a separate Workspace configuration step from the DWD scopes.
  Easy to forget. Mitigation: documented in the Sheets section of
  `README.md`.
- **Negative:** Email notification gap means policies that legally require
  email-of-record won't be satisfied. Acceptable for the volunteer-org
  use case driving this project.
