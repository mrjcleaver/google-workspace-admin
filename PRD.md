# Product Requirements Document (PRD)

## Title

Google Workspace Forwarding Compliance Audit for Volunteers

---

## Problem Statement

Volunteers using organization-managed Google Workspace accounts frequently fail to:

* Check their workspace inboxes regularly
* Configure forwarding to personal email accounts
* Receive timely operational communications

This results in:

* Missed announcements
* Reduced volunteer engagement
* Administrative overhead
* Communication reliability issues during events and onboarding

Current forwarding setup is manual, decentralized, and non-auditable.

---

## Objective

Create a lightweight administrative capability to:

1. Audit forwarding status for all volunteer accounts
2. Identify accounts lacking forwarding
3. Optionally enforce or automate forwarding setup
4. Improve communication reliability without requiring user intervention

---

# Scope

## In Scope

* Use of GAM
* Retrieval of forwarding configuration state
* Reporting/dashboard generation
* Compliance monitoring
* CSV export
* Optional notification workflows

## Out of Scope

* Full mailbox migration
* Gmail API custom application development
* Non-Google email systems
* Personal mailbox management
* Advanced DLP/compliance enforcement

---

# Stakeholders

| Role                   | Interest                          |
| ---------------------- | --------------------------------- |
|  Admins                | Reliable communications           |
| Volunteer Coordinators | Reduced follow-up burden          |
| Volunteers             | Easier communication access       |
| IT Administrators      | Security + operational simplicity |

---

# User Stories

## Admin

* As an admin, I want to see which users have forwarding enabled so I can identify communication risks.
* As an admin, I want automated reporting so I do not manually inspect accounts.
* As an admin, I want to optionally enforce forwarding policies.

## Volunteer

* As a volunteer, I want communications delivered to the inbox I already use.
* As a volunteer, I do not want to manually manage multiple inboxes.

---

# Functional Requirements

## FR1 — Forwarding Audit

System shall execute:

```bash
gam print users forwardingaddresses
```

And retrieve:

* User email
* Forwarding address(es)
* Verification status (if available)
* Delivery settings

---

## FR2 — Compliance Report

Generate report showing:

* Users with no forwarding
* Users with forwarding configured
* Potential invalid forwarding targets
* Summary statistics

Output formats:

* CSV
* Google Sheet
* Markdown summary

---

## FR3 — Scheduled Monitoring

Support recurring execution:

* Daily
* Weekly
* On-demand

Possible execution environments:

* Local admin workstation
* Docker container
* GitHub Actions
* Cloud Run
* Cron job

---

## FR4 — Alerting

Optional notifications for:

* Newly created accounts without forwarding
* Users missing forwarding after onboarding window
* Forwarding failures

Notification targets:

* Email
* Slack webhook
* Discord webhook

---

## FR5 — Policy Enforcement (Optional)

Potential future enhancement:

* Automatically configure forwarding
* Enforce forwarding domains
* Block accounts without forwarding

---

# Non-Functional Requirements

| Requirement     | Target                             |
| --------------- | ---------------------------------- |
| Execution time  | <5 min for <1000 users             |
| Security        | Admin-only execution               |
| Reliability     | 99% successful scheduled runs      |
| Maintainability | Simple shell/Python implementation |
| Portability     | Docker-compatible                  |

---

# Technical Design

## Core Command

```bash
gam print users forwardingaddresses
```

Potential enhanced query:

```bash
gam redirect csv forwarding.csv print users forwardingaddresses
```

---

## Suggested Architecture

```text
Google Workspace
        ↓
      GAM
        ↓
CSV / JSON Output
        ↓
Audit Script
        ↓
Slack / Sheets / Dashboard
```

---

# Data Model

| Field             | Description                 |
| ----------------- | --------------------------- |
| primaryEmail      | Workspace account           |
| forwardingAddress | Destination email           |
| verified          | Whether forwarding verified |
| status            | Compliant / Non-compliant   |
| lastChecked       | Timestamp                   |

---

# Success Metrics

| Metric                          | Target  |
| ------------------------------- | ------- |
| Volunteer forwarding compliance | >90%    |
| Missed communication incidents  | -75%    |
| Manual follow-up workload       | -50%    |
| Onboarding completion time      | <15 min |

---

# Risks

## Security

Automatic forwarding to personal inboxes may:

* Leak sensitive data
* Complicate offboarding
* Conflict with institutional policy

Mitigation:

* Restrict forwarding to approved domains
* Use role-based accounts sparingly
* Maintain audit logs

---

## User Experience

Forwarding does not guarantee message engagement.

Mitigation:

* Multi-channel communication strategy
* Slack/Discord redundancy
* Clear notification expectations

---

# Alternatives Considered

| Option                       | Why Rejected            |
| ---------------------------- | ----------------------- |
| Manual forwarding setup      | Low compliance          |
| Training volunteers harder   | Behaviorally unreliable |
| Shared inboxes only          | Operational friction    |
| Full CRM communication stack | Excessive complexity    |

---

# Recommended MVP

## Phase 1

* Install/configure GAM
* Export forwarding audit CSV
* Produce weekly compliance report

## Phase 2

* Slack alerts
* Automated onboarding reminders
* Dashboard visualization

## Phase 3

* Auto-remediation
* Policy enforcement
* Integration with onboarding systems

---

# Example Operational Workflow

1. Volunteer account created
2. Nightly GAM audit runs
3. Missing forwarding detected
4. Slack alert sent to coordinators
5. Volunteer receives onboarding reminder
6. Compliance verified automatically

---

# Open Questions

1. Should forwarding be mandatory? No
2. Are external forwarding destinations permitted under policy? Yes
3. Should forwarding apply to all roles equally? No, not admins
4. Should Discord/Slack become the primary operational channel instead of email? Maybe
5. Is Google Groups sufficient for some communication classes? Yes

---

# Recommendation

Do not optimize for “teaching volunteers to check email.”

Optimize for:

* automated delivery,
* compliance visibility,
* redundancy,
* and operational reliability.

The GAM audit approach is high leverage because it:

* requires minimal engineering,
* leverages existing infrastructure,
* and materially improves communication reliability immediately.
