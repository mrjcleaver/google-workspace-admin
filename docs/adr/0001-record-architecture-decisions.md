# 0001 — Record architecture decisions

**Status:** Accepted
**Date:** 2026-05-14

## Context

This project's design rationale lives partly in commit messages, partly in the
PRD, and partly in conversations. Future contributors — including future
versions of the original author — won't have access to those conversations.
Several non-obvious choices have already been made (keyless auth, the GAM
"forward" vs. "forwardingaddresses" call, the codespace doesn't-authenticate
posture). When someone later asks "why is it this way", they need a record
that beats grep over a year of commits.

## Decision

Use [Architecture Decision Records](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
(Michael Nygard's format) in `docs/adr/`. Each ADR is a numbered, immutable
markdown file with four sections: **Context**, **Decision**, **Consequences**,
and a header with **Status** and **Date**.

Conventions:

- Files named `NNNN-short-slug.md`, numbered sequentially.
- Statuses: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-XXXX`.
- ADRs are immutable. To change a decision, write a new ADR that supersedes
  the old one and update both files' status fields.
- Trivial decisions don't need ADRs. The bar: would a future contributor
  reasonably ask "why is this this way?"

`docs/adr/README.md` indexes them.

## Consequences

- **Positive:** Future-you (and any collaborator) sees why each load-bearing
  choice was made without spelunking through commit history.
- **Positive:** Forces explicitness when a decision is being made — drafting
  an ADR often exposes that the trade-off hasn't actually been thought through.
- **Negative:** Light overhead per significant decision. Acceptable.
- **Negative:** ADRs decay if not maintained. Mitigation: PRs that change
  load-bearing behaviour should reference (or supersede) the relevant ADR.
