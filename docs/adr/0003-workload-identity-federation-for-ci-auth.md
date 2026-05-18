# 0003 — Keyless CI auth via Workload Identity Federation

**Status:** Accepted
**Date:** 2026-05-14

## Context

The audit runs unattended on a weekly schedule via GitHub Actions and needs
to:

1. Authenticate to Google as a Workspace admin (`oauth2.txt` admin OAuth).
2. Impersonate each Workspace user via **domain-wide delegation** to read
   their Gmail forwarding setting.

The conventional way to do (2) is a service-account private key on the
runner. [Google's authentication decision tree](https://cloud.google.com/docs/authentication)
explicitly discourages long-lived SA keys — they're a known breach vector.
Static keys in CI secrets are exactly the scenario the decision tree warns
about.

GitHub Actions can mint short-lived OIDC tokens, and Google Cloud's
Workload Identity Federation (WIF) accepts those as federated credentials.
The complication is DWD: it works by GAM signing a JWT with the SA's
private key. Without a key, GAM has to call `iamcredentials.signJwt` to
sign the JWT server-side using Google-managed keys.

## Decision

CI uses Workload Identity Federation with no SA private key on the runner.

GCP-side (one-time, captured in `README.md` setup block):

- Workload Identity Pool `github-actions-pool` with an OIDC provider
  `github-actions-provider` issued by `token.actions.githubusercontent.com`,
  attribute-conditioned to `assertion.repository == "mrjcleaver/google-workspace-admin"`.
- Three IAM bindings on the SA `gam-project-o94yk@gam-project-o94yk.iam.gserviceaccount.com`:
  - `roles/iam.workloadIdentityUser` → the federated principalSet (allows
    SA impersonation).
  - `roles/iam.serviceAccountTokenCreator` → the federated principalSet
    (allows signJwt as the SA).
  - `roles/iam.serviceAccountTokenCreator` → `serviceAccount:<SA itself>`
    (self-binding; needed because the ADC chain impersonates the SA, so
    the signJwt call is *from* the SA acting on itself).

Workflow-side (`.github/workflows/audit.yml`):

- `permissions: id-token: write` enables the OIDC token.
- `google-github-actions/auth@v2` exchanges the OIDC token for a federated
  credential and writes an `external_account` file referenced by
  `GOOGLE_APPLICATION_CREDENTIALS`.
- The workflow writes `~/.gam/oauth2service.json` in **signjwt mode**: full
  SA-key shape (`type: "service_account"`, all standard URI fields) with
  `private_key`/`private_key_id` blanked and `key_type: "signjwt"`. This
  is what tells GAM to use the IAM Credentials signJwt path instead of
  loading a local PEM.

Workspace-side (one-time):

- SA's numeric OAuth client_id `107525637798911250021` registered in
  Workspace Admin → API controls → Domain-wide delegation, with scopes
  `gmail.settings.basic`, `gmail.settings.sharing`,
  `admin.directory.user.readonly`, `admin.directory.group.readonly`,
  `admin.directory.domain.readonly`. The audit's pre-run step
  `gam user <admin> check serviceaccount scopes ...` will FAIL if any
  of these are missing — that is the canary for "No Client Access allowed".

## Consequences

- **Positive:** No long-lived key on the runner or in any secret store.
  Compromise window per audit run is at most the lifetime of one
  federated token (~1 hour).
- **Positive:** Aligns with Google's recommended posture and with the
  user's keyless preference (see memory note `feedback_keyless_gcp`).
- **Negative:** More moving parts. Three IAM bindings, the WIF pool/provider,
  and the signjwt-mode SA descriptor all have to be correct or the chain
  silently falls back to admin OAuth and fails with the misleading
  `ERROR: No Client Access allowed`.
- **Negative:** The signjwt-mode descriptor must mirror the *full* SA key
  shape (not an abbreviated `{client_email, key_type}` JSON). GAM's loader
  expects every field a real key file has; abbreviated descriptors get
  treated as malformed and trigger the silent oauth2.txt fallback. See
  memory note `project_gam7_wif_gotcha`.
- **Negative:** No working keyless path from a codespace exists (GAM7's
  WIF support requires an OIDC token source, which a codespace doesn't
  have). Hence [ADR-0004](0004-codespaces-do-not-authenticate.md).
