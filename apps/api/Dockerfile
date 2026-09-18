# NazdikStore API — production image (Nest + mini fallback)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# Best-effort install; monorepo may need full install in CI
RUN npm install --omit=dev --workspaces=false || true

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV ALLOW_OFFLINE=1
ENV REDIS_URL=""
ENV PAYMENT_PROVIDER=mock
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 4000
# Offline mini API is the reliable production demo path until Nest+Postgres are wired
CMD ["node", "test/mini-server.cjs"]
