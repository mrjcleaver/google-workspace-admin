# 0005 — Audit Gmail auto-forwarding (`forward`), not `forwardingaddresses`

**Status:** Accepted (amends PRD FR1)
**Date:** 2026-05-14

## Context

PRD FR1 names the GAM command as:

```bash
gam print users forwardingaddresses
```

This is the wrong command for the audit's actual goal.

Gmail has two related-but-distinct features:

| Feature | What it is | GAM7 command |
| ------- | ---------- | ------------- |
| **Auto-forwarding** | "Forward a copy of incoming mail to `addr`" — the toggle in Gmail Settings → Forwarding and POP/IMAP. Applies to every incoming message. | `gam all users print forward` |
| **Forwarding addresses** | The list of addresses *eligible* as targets for filter actions ("Forward it to…"). Not active by themselves; populated when users add filters or set auto-forwarding. | `gam print users forwardingaddresses` |

The PRD's operational problem statement is "volunteers don't check their
workspace inboxes" — i.e., we want their mail to reach a personal inbox
they actually read. That's the *auto-forwarding* setting, not the list of
filter-action targets. A user can have a forwarding address registered
(verified, even) without any filter using it, and zero mail will be
forwarded.

## Decision

Use `gam all users print forward`. Each row exposes `forwardingEnabled`,
`forwardingEmail`, and `disposition` (`leaveInInbox` / `archive` /
`markRead` / `trash`). The compliance classifier in `src/compliance.ts`
treats this as the source of truth for whether a user's mail actually
gets forwarded.

PRD FR1 is considered amended by this ADR. The PRD should be updated on
its next revision to reflect the right command.

## Consequences

- **Positive:** Matches the operational need. A "compliant" user actually
  has mail being forwarded.
- **Positive:** Simpler data shape — one row per user, not multiple rows
  per user (which `forwardingaddresses` produces when a user has several
  registered targets).
- **Negative:** Diverges from PRD literal text. Future readers comparing
  this ADR to the PRD will need to read both.
- **Negative:** A user who has a single auto-forward to address X *plus*
  a filter sending some mail to Y won't have Y captured. The audit's
  question is "does mail reach this user", and any auto-forward is
  sufficient to answer yes — so this is intentional, but it means the
  audit is silent on filter-based partial forwarding setups.
