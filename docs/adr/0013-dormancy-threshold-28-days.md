# 0013 — Default dormancy threshold: 28 days

**Status:** Accepted
**Date:** 2026-05-18
**Amends:** [ADR-0009](0009-reachability-classification.md), [ADR-0011](0011-active-users-compliant-without-forwarding.md)

## Context

ADR-0009 and ADR-0011 set up the `--unreachable-after-days` knob as the
single threshold for both "dormant" (unreachable computation) and
"active" (compliance via reachability). Both shipped with a default of
90 days, chosen as the common Workspace lifecycle figure for inactive
accounts.

Live data from `guelphrobotics.ca` showed this is too lax for a
volunteer org:

- The audit runs weekly; 90 days is ~13 audit cycles of lag before a
  drift-into-dormancy gets flagged.
- Volunteer engagement cadence is weekly-to-monthly, not quarterly.
  Someone who hasn't logged in for two months has effectively
  disengaged, regardless of whether the account is technically still
  active.
- "Improper setup" cases (never-logged-in accounts) are already
  caught immediately by the `daysSinceLogin == -1` sentinel — this
  threshold is only about the in-between case.

## Decision

The default value of `--unreachable-after-days` is **28** (four weeks),
not 90. References in ADR-0009 and ADR-0011 to "default 90" should be
read as "the value at the time of writing"; the operative default is
this ADR.

The flag still accepts any non-negative integer. Stricter (`7`, `14`)
or laxer (`60`, `90`) values are reasonable in different operational
contexts and remain available without a code change.

## Consequences

- **Positive:** Matches the org's actual operating cadence — a
  volunteer who hasn't touched their account in a month is genuinely
  out of touch.
- **Positive:** Catches drift earlier; 4 additional users (29–44 days
  on the live data) flip from active-compliant to dormant, with the
  forwarding/recovery question surfaced for follow-up.
- **Negative:** More false positives for users who travel or take
  short hiatuses. Mitigation: humans triaging the audit can spot-check
  before action; `--unreachable-after-days` override is one flag away.
- **Negative:** Tightening the threshold without revisiting it later
  encourages alert-fatigue. Mitigation: revisit if the unreachable
  list grows to where coordinators stop reading it.
