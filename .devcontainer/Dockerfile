# Dev environment built on the same base image as the project's own Dockerfile,
# so the devcontainer matches what actually ships. No docker-in-docker: this is
# just the image the Codespace runs in, not a container built from within it.
FROM node:20-alpine

RUN apk add --no-cache bash git curl python3 libc6-compat ca-certificates

# gcloud CLI — for the one-time GCP setup in README.md and scripts/enable-apis.sh.
# Alpine has no `google-cloud-cli` apk package, so use the official installer.
RUN curl -sSL https://sdk.cloud.google.com > /tmp/install-gcloud.sh \
    && bash /tmp/install-gcloud.sh --disable-prompts --install-dir=/usr/local \
    && rm /tmp/install-gcloud.sh
ENV PATH="/usr/local/google-cloud-sdk/bin:${PATH}"

RUN npm install -g @anthropic-ai/claude-code ruflo@latest

WORKDIR /workspace
