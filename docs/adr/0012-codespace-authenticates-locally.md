# 0012 — Codespaces CAN authenticate; local runs supported

**Status:** Accepted
**Date:** 2026-05-18
**Supersedes:** [ADR-0004](0004-codespaces-do-not-authenticate.md)

## Context

[ADR-0004](0004-codespaces-do-not-authenticate.md) claimed that GAM7 had
"no working keyless path from a codespace" because its WIF support
requires an OIDC token source and it doesn't parse
`impersonated_service_account` credential files. Per that ADR the
codespace deliberately stayed unauthenticated; all live runs had to go
through `gh workflow run audit.yml`.

This turned out to be wrong. Two distinct paths actually work locally,
both keyless:

1. **GAM with end-user ADC + signjwt mode SA descriptor.** GAM's
   `~/.gam/oauth2service.json` describes the SA in `key_type=signjwt`
   mode (same shape the CI workflow writes); GAM's google-auth library
   calls `iamcredentials.signJwt` to mint per-user DwD tokens. The
   end-user ADC principal must hold `roles/iam.serviceAccountTokenCreator`
   on the SA. This works for admin OAuth flows
   (`gam info domain`, `gam print users`, `gam print group-members`) and
   — with the additional `roles/serviceusage.serviceUsageConsumer` grant
   on the SA's project plus `gcloud auth application-default
   set-quota-project gam-project-o94yk` — for per-user impersonation
   (`gam user X show forward`, `gam all users print forward`).

2. **Direct SA-impersonated token mint for Sheets writes.** The audit's
   sheets reporter (`src/reporters/sheets.ts`) honors an optional
   `IMPERSONATE_SERVICE_ACCOUNT` env var. When set it calls
   `iamcredentials.generateAccessToken` (with `X-Goog-User-Project:
   gam-project-o94yk` — the canary header that fixes the local
   discovery-doc fetch) to mint a Sheets-scoped SA token, then writes
   to a sheet that the SA has been shared with as Editor. This bypasses
   the Workspace policy that blocks the gcloud OAuth client from being
   granted the sensitive `https://www.googleapis.com/auth/spreadsheets`
   scope.

## Decision

- The codespace is a supported execution environment for the audit.
- Path 1 (GAM-via-ADC) is documented in `scripts/dump-csvs.sh` —
  exports forwarding/users/groups CSVs locally and exits cleanly on
  partial failures.
- Path 2 (SA-impersonated Sheets writes) is enabled by setting
  `IMPERSONATE_SERVICE_ACCOUNT` before running the audit.
- CI via `gh workflow run audit.yml` remains the canonical scheduled
  path (weekly cron + workflow_dispatch). Local runs are for development,
  ad-hoc audits, and offline iteration on classification logic.

Prerequisites (one-time, per codespace):

```
# IAM grants on gam-project-o94yk (run as a project owner):
gcloud projects add-iam-policy-binding gam-project-o94yk \
  --member="user:<you>@guelphrobotics.ca" \
  --role="roles/iam.serviceAccountTokenCreator"
gcloud projects add-iam-policy-binding gam-project-o94yk \
  --member="user:<you>@guelphrobotics.ca" \
  --role="roles/serviceusage.serviceUsageConsumer"

# Quota project on local ADC:
gcloud auth application-default set-quota-project gam-project-o94yk

# Sheet ACL (for Sheets writes):
# share target spreadsheet with
# gam-project-o94yk@gam-project-o94yk.iam.gserviceaccount.com as Editor
```

## Consequences

- **Positive:** Reverses the dev-loop friction from ADR-0004 — no need
  to push a commit and wait for a workflow run to see classification
  changes against live data.
- **Positive:** The local Sheets-impersonation path is reusable for any
  future feature that needs Sheets API access; it's localized to the
  reporter and doesn't leak into the rest of the codebase.
- **Negative:** End-user ADC token has broader scopes than a federated
  SA principal. If a developer's account is compromised, the blast radius
  is wider than the CI path. Mitigation: only super-admins should hold
  the two IAM roles; rotate via standard Workspace recovery if needed.
- **Negative:** Workspace admins enforcing "no third-party app access"
  could block path 2 (the gcloud OAuth client is what mints the source
  token). Mitigation: path 2 already works around the sensitive-scope
  block specifically; if a stricter policy lands, fall back to running
  via CI.
- **Negative:** Two more knobs in the project setup. The README and
  `scripts/dump-csvs.sh` carry the documentation burden.
