#! bash
PROJECT_ID=agentics-487016
GH_REPO=mrjcleaver/google-workspace-admin
SA_EMAIL=667037737667-llr8q99p635piejnh3k6pegm2orqih35.apps.googleusercontent.com
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

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

echo "GCP_WIF_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider"
