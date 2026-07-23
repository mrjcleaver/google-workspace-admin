# google-workspace-admin

Forwarding compliance audit for Google Workspace volunteer accounts, driven by
[GAM](https://github.com/GAM-team/GAM). Implements the MVP described in `PRD.md`:

- FR1 — Audit forwarding state for all users
- FR2 — Compliance report (CSV, Markdown, optional Google Sheet)
- FR3 — Scheduled execution (Docker, GitHub Actions, cron)
- FR4 — Optional Slack / Discord webhook alerts

## Install

```bash
npm install
npm run build
```

For local development you only need GAM if you want to refresh fixtures.
Day-to-day work uses `--forwarding-input` / `--users-input` against the CSVs in
`fixtures/` or against artifacts pulled from a CI run.

### Live audits without local credentials

By design this repo holds no GCP/Workspace credentials locally — all live runs
happen in GitHub Actions (which authenticates via Workload Identity Federation,
no key on disk). To trigger a live audit on demand and pull the result back:

```bash
gh workflow run audit.yml                              # or pass -f dry_run=true
gh run watch                                           # wait for it to finish
gh run download --name forwarding-audit --dir ./out    # csv + md in ./out/
```

Scheduled runs (Mondays 08:00 UTC) post to Slack/Discord if `SLACK_WEBHOOK` is
configured.

## Run

### Against a live workspace (shells out to gam)

```bash
node dist/index.js --out-dir out
```

This only works in an environment where `gam` is already authenticated against
the target workspace (e.g. an admin workstation that owns the keys, or the CI
job whose WIF flow has run). The codespace deliberately does not authenticate
— use `gh workflow run audit.yml` instead.

### Against pre-fetched CSVs

```bash
gam print users forwardingaddresses > forwarding.csv
gam print users fields primaryEmail,suspended,isAdmin,orgUnitPath > users.csv

node dist/index.js \
  --forwarding-input forwarding.csv \
  --users-input users.csv
```

If you supply `--forwarding-input` but omit `--users-input`, the tool runs in
*forwarding-only* mode — it can only describe users that GAM returned a
forwarding entry for, and cannot detect users with no forwarding at all.

### Outputs

By default written to `./out/`:

- `forwarding-audit.csv` — one row per user, with status + reason
- `forwarding-audit.md` — human-readable summary + non-compliant lists

The markdown summary is also printed to stdout on every run.

### Webhooks (FR4)

```bash
node dist/index.js --webhook https://hooks.slack.com/services/...
node dist/index.js --webhook https://discord.com/api/webhooks/...
```

Flavor is auto-detected from the URL; override with `--webhook-flavor slack|discord`.

### Google Sheets (FR2)

```bash
node dist/index.js --sheet-id 1AbC...XyZ --sheet-name "Forwarding Audit"
```

Auth is via Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`).
In CI this is the WIF credential file written by `google-github-actions/auth`;
in a codespace it's whatever ADC source you've configured (see below). The
identity must have edit access to the target spreadsheet — share it with the
GAM service account email.

### Compliance policy

```
--allowed-domain gmail.com       # repeatable; restrict allowed forwarding destinations
--no-exempt-admins               # admins are exempt by default (PRD open Q3)
--no-exempt-suspended            # suspended users are exempt by default
```

A user is:

- **compliant** — has forwarding configured (and verified, if GAM reports it)
- **non-compliant** — no forwarding entry at all
- **invalid** — forwarding present but unverified, or to a disallowed domain
- **exempt** — admin or suspended (when exemption flags are on)

## Scheduled execution (FR3)

### GitHub Actions

`.github/workflows/audit.yml` runs weekly on Mondays at 08:00 UTC and on demand.
Authentication uses **Workload Identity Federation** — there is no long-lived
service-account key on the runner. The workflow mints a short-lived federated
credential at run time; GAM7's bundled google-auth library uses the IAM
Credentials `signJwt` API to perform domain-wide delegation without a private
key.

Required configuration:

**Repository variables** (Settings → Secrets and variables → Actions → Variables tab — these are not secret):

| Variable | Purpose |
| -------- | ------- |
| `GCP_SA_EMAIL` | Service account email (e.g. `gam-project-o94yk@gam-project-o94yk.iam.gserviceaccount.com`) |
| `GCP_SA_CLIENT_ID` | SA's numeric OAuth client_id (~21 digits) — same value registered in Workspace Admin DWD |

**Repository secrets**:

| Secret | Purpose |
| ------ | ------- |
| `GCP_WIF_PROVIDER` | Full WIF provider resource name (`projects/<num>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`) |
| `GAM_OAUTH2_JSON` | Contents of `~/.gam/oauth2.txt` (admin user OAuth, used for non-impersonated calls) |
| `SHEET_ID` | Target spreadsheet ID (optional) |
| `SLACK_WEBHOOK` | Slack/Discord webhook URL (optional) |

#### One-time GCP setup

Run these once against your GCP project (replace `PROJECT_ID`, `GH_REPO`, and
`SA_EMAIL` with your values):

```bash
PROJECT_ID=gam-project-o94yk
GH_REPO=mrjcleaver/google-workspace-admin
SA_EMAIL=gam-project-o94yk@gam-project-o94yk.iam.gserviceaccount.com
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

# 1. Enable APIs
gcloud services enable \
  iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com \
  gmail.googleapis.com admin.googleapis.com \
  --project "$PROJECT_ID"

# 2. Create the Workload Identity Pool + GitHub OIDC provider
gcloud iam workload-identity-pools create github-actions-pool \
  --project "$PROJECT_ID" --location global \
  --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-actions-provider \
  --project "$PROJECT_ID" --location global \
  --workload-identity-pool github-actions-pool \
  --display-name "GitHub Actions OIDC" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "attribute.repository == \"$GH_REPO\""

# 3. Grant the federated identity permission to (a) impersonate the SA and
#    (b) call signJwt as the SA — the second binding is what makes DWD work
#    without a private key.
PRINCIPAL="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/$GH_REPO"

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "$PRINCIPAL"

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT_ID" \
  --role roles/iam.serviceAccountTokenCreator \
  --member "$PRINCIPAL"

# 4. Print the provider resource name to paste into GCP_WIF_PROVIDER secret
echo "GCP_WIF_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider"
echo "GCP_SA_EMAIL     = $SA_EMAIL"
```

`gmail.googleapis.com` and `admin.googleapis.com` must be enabled or GAM fails
per-user with `gam exited 73: ... Gmail API Service/App not enabled` — this is
independent of the DWD scope grant below (that controls *which* scopes the SA
may request; this controls whether the API is reachable at all).

#### One-time Workspace Admin setup

In `admin.google.com` → Security → Access and data control → API controls →
Domain-wide delegation, confirm the SA's numeric client_id is registered with
the scopes the audit needs. Minimum set:

- `https://www.googleapis.com/auth/gmail.settings.basic` — read per-user forwarding
- `https://www.googleapis.com/auth/admin.directory.user.readonly` — user list + recoveryEmail
- `https://www.googleapis.com/auth/admin.directory.group.readonly` — per-user group membership
- `https://www.googleapis.com/auth/admin.directory.domain.readonly` — `gam info domain` sanity check

Paste comma-separated, no spaces. Verify with `gam user <admin> check serviceaccount`
— the CI workflow runs this on every audit and fails fast on scope drift.
This is independent of WIF and only needs to be done once.

Also set the repo variable `GAM_ADMIN_EMAIL` (Settings → Variables → Actions)
to the admin account used for impersonation during the scope check, e.g.
your primary super-admin address.

### Docker

```bash
docker build -t gws-audit .
docker run --rm \
  -v "$HOME/.gam:/root/.gam:ro" \
  -v "$PWD/out:/app/out" \
  gws-audit --out-dir /app/out
```

Note: the base image does not include `gam` — build a derived image that
installs it, or use the `--forwarding-input`/`--users-input` path with CSVs
mounted in.

### cron

```
0 8 * * 1   cd /opt/gws-audit && node dist/index.js --webhook "$SLACK_WEBHOOK" >> audit.log 2>&1
```

## Develop

```bash
npm run typecheck   # tsc --noEmit
npm test            # builds with tsconfig.test.json + runs node:test
```

Fixtures live in `fixtures/` and are exercised by `test/*.test.ts`.

## Project layout

```
src/
  index.ts            CLI entry
  cli.ts              argv parser
  gam.ts              spawns gam, reads files
  parser.ts           tolerant CSV → records
  compliance.ts       classifier + summary
  reporters/
    csv.ts
    markdown.ts
    sheets.ts
    webhook.ts
  types.ts
```
