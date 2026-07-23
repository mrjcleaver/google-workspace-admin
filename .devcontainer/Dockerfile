# Dev environment built on the same base image as the project's own Dockerfile,
# so the devcontainer matches what actually ships. No docker-in-docker: this is
# just the image the Codespace runs in, not a container built from within it.
FROM node:20-alpine

RUN apk add --no-cache bash git curl

RUN npm install -g @anthropic-ai/claude-code ruflo@latest

WORKDIR /workspace
