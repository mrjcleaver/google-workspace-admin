FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
# GAM is expected to be installed in a derived image or mounted at /opt/gam.
# Override GAM_PATH if installed elsewhere.
ENV GAM_PATH=gam
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
ENTRYPOINT ["node", "dist/index.js"]
