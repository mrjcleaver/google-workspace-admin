# 0006 — Compliance classification rules

**Status:** Superseded by [ADR-0011](0011-active-users-compliant-without-forwarding.md) (partial — exempt and invalid rules still apply)
**Date:** 2026-05-14

## Context

PRD FR2 asks for a report distinguishing users with/without forwarding and
"potential invalid forwarding targets," but doesn't specify the exact
rules. Several judgement calls have to be made explicit before the audit
output is meaningful:

- How to treat **unverified** forwarding (`verificationStatus = pending`).
  GAM reports a verification status; Gmail won't actually deliver to an
  unverified address. Is an unverified forward "configured" or "broken"?
- Whether to enforce a **forwarding-domain allowlist** (e.g., "personal
  gmail addresses OK, sketchy domains not OK"). PRD risk section mentions
  "restrict forwarding to approved domains" as a mitigation; PRD Open Q2
  answers "external destinations permitted: Yes."
- How to handle **admins** (PRD Open Q3 answers "not admins" — admins are
  exempt).
- How to handle **suspended** users (PRD silent).
- How to handle users with **no forwarding entry at all**.

## Decision

The classifier (`src/compliance.ts`) sorts each user into exactly one of
four statuses:

| Status | Condition |
| ------ | --------- |
| **compliant** | Has at least one forwarding address that is verified (or unverified-but-GAM-doesn't-report-status), and within `--allowed-domain` if that flag is given. |
| **non-compliant** | No forwarding entry at all. |
| **invalid** | Has a forwarding entry, but it's unverified, or its domain is outside `--allowed-domain`. Treated as a soft failure — the user thinks they have forwarding but it isn't actually working. |
| **exempt** | Either the user is an admin (when `--exempt-admins` is on, default) or the user is suspended (when `--exempt-suspended` is on, default). Admin exemption wins over suspended labelling. |

Configuration:

- `--allowed-domain <d>` (repeatable). If absent, all domains accepted.
- `--no-exempt-admins`, `--no-exempt-suspended` to turn exemptions off.

Summary stats report total / compliant / non-compliant / invalid / exempt
counts and a compliance % calculated over evaluable (non-exempt) users.

## Consequences

- **Positive:** The four-bucket scheme is exhaustive and mutually exclusive
  — every user lands in exactly one column, no ambiguity in reports.
- **Positive:** Domain allowlist is opt-in; default behaviour matches PRD
  Open Q2 ("external destinations permitted").
- **Positive:** Admin exemption is on by default per PRD Open Q3.
  Suspended-exemption is a sensible default extension; flag exists to
  disable if a future policy wants suspended users included as
  non-compliant.
- **Negative:** "Compliant" doesn't actually verify the forwarding works
  end-to-end — only that the configuration claims it should. Mail
  delivery failures past Gmail's own checks aren't surfaced. Out of scope.
- **Negative:** No "stale" status. A forwarding target that worked a year
  ago but isn't read any more (different problem from "unverified") is
  classified as compliant. The audit can't tell.
- **Negative:** Verified-vs-pending threshold means a brand-new
  not-yet-clicked forward setup looks "invalid" rather than "in flight."
  Acceptable trade-off — coordinators following up on "invalid" users
  catches both broken and incomplete setups.
