# NazdikStore web — Next.js demo
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
WORKDIR /app/apps/web
RUN npm install --omit=dev || true
RUN npm run build || true

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
COPY --from=build /app/apps/web ./
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
