#!/usr/bin/env bash
# One-time GCP API enablement for GAM Gmail/Directory access. Without this,
# GAM fails per-user with "gam exited 73: ... Gmail API Service/App not
# enabled" even though DWD scopes are granted correctly — the API itself
# has to be turned on for the project separately from the scope grant.
#
# Usage:
#   scripts/enable-apis.sh [PROJECT_ID]
# Defaults PROJECT_ID to the active gcloud config project.

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "error: no project id given and no active gcloud project set" >&2
  echo "usage: scripts/enable-apis.sh <PROJECT_ID>" >&2
  exit 1
fi

echo "enabling gmail.googleapis.com + admin.googleapis.com on $PROJECT_ID"
gcloud services enable \
  gmail.googleapis.com \
  admin.googleapis.com \
  --project "$PROJECT_ID"

echo "done — propagation can take a couple of minutes before GAM calls succeed"
