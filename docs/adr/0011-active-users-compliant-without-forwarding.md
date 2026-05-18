# 0011 — Active users are compliant without forwarding

**Status:** Accepted
**Date:** 2026-05-18
**Supersedes:** [ADR-0006](0006-compliance-classification-rules.md) (in part — exempt/invalid rules carry over)

## Context

[ADR-0006](0006-compliance-classification-rules.md) defined `non-compliant`
as "no forwarding entry at all." That mapped the compliance question to a
purely configurational check: did the user click the right buttons in
Gmail settings?

In practice, the org's actual concern is reachability — forwarding only
matters when the user *isn't* using their account. A volunteer who logs
into Workspace weekly and reads mail directly doesn't need forwarding;
flagging them as `non-compliant` produces noise, drives policy fatigue,
and obscures the genuine failure mode (dormant accounts with no
forwarding fallback — see [ADR-0009](0009-reachability-classification.md)).

On the live `guelphrobotics.ca` data, ADR-0006's rules produced
0% compliance because nobody set up auto-forwarding — yet most users
were perfectly reachable.

## Decision

A user with `daysSinceLogin <= --unreachable-after-days` (default 90) is
**compliant** regardless of forwarding configuration, with reason
`active user (logged in Nd ago)`. The other ADR-0006 rules still apply
in order:

| Status | Condition (in order) |
| ------ | -------------------- |
| **exempt** | admin (if `--exempt-admins`) or suspended (if `--exempt-suspended`) |
| **compliant** | active (within `--unreachable-after-days`) — *new*, OR has working forwarding (verified, within allowed domains) |
| **invalid** | has forwarding but it's unverified or outside `--allowed-domain` — unchanged from 0006 |
| **non-compliant** | dormant AND no forwarding configured |

Active users with **broken** forwarding (unverified, wrong domain) stay
`invalid` rather than being upgraded to `compliant`. Rationale: the user
might come to depend on the broken rule and silently lose mail later; the
broken state is worth surfacing for cleanup.

The `unreachable` flag (ADR-0009) is computed independently of `status`.

## Consequences

- **Positive:** Compliance % becomes a meaningful metric — it tracks
  "real reachability problems" not "configurational hygiene." Initial
  live-data jump: 0% → 66.7%.
- **Positive:** Pairs naturally with ADR-0009: `non-compliant` and
  `unreachable` are now nearly the same set, but kept as separate columns
  so future policy (e.g., "everyone must have forwarding") can be
  reintroduced without code changes.
- **Negative:** Active threshold = unreachable threshold = the same
  number. Conceptually they could differ (e.g., "active = ≤30d,
  unreachable = >90d, anything in between is a warning"). Deferred —
  introduce a separate `--active-within-days N` flag only when a real
  case appears.
- **Negative:** "Compliant" no longer means "you set forwarding up." If
  someone needs that stricter view, the four buckets in 0006 are
  recoverable by setting `--unreachable-after-days 0` so no user counts
  as active. Documented but not advertised.
