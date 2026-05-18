# 0009 — Reachability classification (`unreachable` flag)

**Status:** Accepted
**Date:** 2026-05-18

## Context

[ADR-0006](0006-compliance-classification-rules.md) sorts users into four
forwarding-compliance buckets but doesn't answer the operational question
volunteers actually keep asking: **"can mail sent to this address reach
anyone?"** A user can be `non-compliant` (no forwarding configured) yet
still receive mail fine if they log in regularly; conversely an "improper
setup" case (account exists, never logged in, no forwarding) silently
discards every message sent to it.

The original four-bucket scheme conflated two orthogonal concerns:

- **Configuration compliance** — is forwarding set up the way the org's
  policy requires?
- **Reachability** — does mail sent here actually land somewhere?

We need a signal for the second question without inflating the bucket
scheme.

## Decision

Add a derived boolean `unreachable` on each audit record, computed from
two existing inputs:

- `daysSinceLogin` (computed from directory `lastLoginTime`; sentinel
  `-1` means never logged in)
- `forwardingAddresses` (existing PRD FR1 data)

```
unreachable = (suspended)
           OR (dormant AND no working forwarding)

dormant         = daysSinceLogin == -1 OR daysSinceLogin >= threshold
working forward = any entry that is enabled and not explicitly unverified
threshold       = --unreachable-after-days N (default 90)
```

The flag is **orthogonal** to the compliance status from ADR-0006/0011:
an active user with no forwarding is compliant and reachable; a dormant
user with verified forwarding is compliant and reachable; a dormant user
with no forwarding is non-compliant and unreachable.

Suspended users are unreachable by definition; the existing
`--exempt-suspended` flag is independent of this classification.

Surfaces in:

- CSV / Sheets: `daysSinceLogin`, `lastLoginTime`, `unreachable` columns
- Markdown: new **Unreachable** section listing users with last-login date
- Summary stats: `Unreachable (dormant + no forwarding)` count

`lastLoginTime` is the directory-wide "last Google login" signal —
admin console, Gmail, Drive, Calendar all count. A Gmail-specific
"last opened email" signal exists via the Admin Reports API
(`gmail:last_used_time`) but requires a new DwD scope
(`admin.reports.usage.readonly`) and per-user fetches; we defer it
unless directory data proves insufficient (deferred ADR, see README).

## Consequences

- **Positive:** Surfaces the "improper setup" case (account exists,
  never logged in, recovery email set but no forwarding) which the
  four-bucket scheme treated as plain non-compliant.
- **Positive:** Free w.r.t. scopes — `lastLoginTime` is already covered
  by `admin.directory.user.readonly`.
- **Negative:** "Working forwarding" check is heuristic (we trust
  `enabled` and `!verified === false`). A forward to a dead mailbox still
  counts. Acceptable — we're not verifying delivery end-to-end.
- **Negative:** Threshold is one number for all users. Volunteers on
  summer break trigger false positives. Mitigation: `--unreachable-after-days`
  override; in practice the audit is run by humans who can spot-check.
- **Negative:** Daily granularity isn't quite right — a user who logs in
  Sunday and the audit runs Monday at noon shows ≥ 0 days. Fine, this is
  not a security clock.
