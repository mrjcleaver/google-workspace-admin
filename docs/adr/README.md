# Architecture Decision Records

Decisions for the `google-workspace-admin` forwarding compliance audit, in
[Michael Nygard's ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

Each ADR captures a single design choice: the context that forced the choice,
what was decided, and what we accept as consequences. ADRs are immutable once
accepted — to change a decision, write a new ADR that supersedes the old one.

## Index

| # | Title | Status |
| - | ----- | ------ |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-use-gam7-for-workspace-integration.md) | Use GAM7 as the Workspace integration layer | Accepted |
| [0003](0003-workload-identity-federation-for-ci-auth.md) | Keyless CI auth via Workload Identity Federation | Accepted |
| [0004](0004-codespaces-do-not-authenticate.md) | Codespaces do not authenticate; live runs go through CI | Superseded by 0012 |
| [0005](0005-audit-forward-setting-not-forwardingaddresses.md) | Audit Gmail auto-forwarding (`forward`), not `forwardingaddresses` | Accepted (amends PRD FR1) |
| [0006](0006-compliance-classification-rules.md) | Compliance classification rules | Superseded (partial) by 0011 |
| [0007](0007-output-formats.md) | Output formats: CSV + Markdown default, Sheets + webhook optional | Accepted |
| [0008](0008-no-state-persistence-between-runs.md) | No state persistence between runs | Accepted |
| [0009](0009-reachability-classification.md) | Reachability classification (`unreachable` flag) | Accepted |
| [0010](0010-default-audit-scope-root-ou-only.md) | Default audit scope: root OU only | Accepted |
| [0011](0011-active-users-compliant-without-forwarding.md) | Active users are compliant without forwarding | Accepted |
| [0012](0012-codespace-authenticates-locally.md) | Codespaces CAN authenticate; local runs supported | Accepted |

## Deferred

These will be written when the work begins:

- Alerting cadence and grouping (PRD FR4 / Phase 2)
- Onboarding-window detection (PRD FR4 / Phase 2)
- Auto-remediation scope (PRD FR5 / Phase 3)
- Comms channel strategy — Slack/Discord vs. email primacy (PRD Open Q4)
- Gmail-specific last-used-time signal via Admin Reports API (alternative to
  directory `lastLoginTime` from 0009) — add only if directory data proves
  insufficient for the dormancy decision
