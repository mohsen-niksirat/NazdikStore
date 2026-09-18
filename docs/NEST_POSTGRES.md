# NazdikStore — Nest + Postgres (v2.0 production path)

When Docker and a full npm install are available, run the **real Nest API** instead of the offline mini server.

## 1. Infrastructure

```bash
# From repo root
docker compose up -d postgres redis

# Wait until healthy
docker compose ps
```

Postgres: `nazdik:nazdik_local@localhost:5432/nazdik` (PostGIS image).

## 2. Install full dependencies

```bash
# Prefer npm with workspaces once registry is reachable
npm install

# Generate Prisma client + migrate
cd apps/api
npx prisma generate
npx prisma migrate deploy
```

Migrations live in `apps/api/prisma/migrations/` (Phases 1–5 SQL).

## 3. Environment

```bash
cp .env.production.example apps/api/.env
# edit DATABASE_URL, REDIS_URL, JWT secrets
# PAYMENT_PROVIDER=zarinpal|saman|mock
# SMS_PROVIDER=kavenegar|smsir|console
# ALLOW_DEV_LOGIN=0
# NODE_ENV=production
```

## 4. Run Nest

```bash
cd apps/api
npm run dev:nest          # nest start --watch
# or
npm run build && npm start
```

- API: `http://localhost:4000/api/v1`
- Swagger: `http://localhost:4000/api/docs`
- Health: `http://localhost:4000/api/v1/health`

## 5. Docker demo (mini API — always works)

```bash
docker compose -f docker-compose.demo.yml up --build
# API :4000  Web :3300
```

## 6. Switch frontend to Nest

`apps/web` already calls `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:4000`).

Disable offline mini path by running Nest on the same port.

## 7. Production checklist

- [ ] `ALLOW_DEV_LOGIN=0`
- [ ] Strong `JWT_ACCESS_SECRET` + `PAYMENT_HMAC_SECRET`
- [ ] Real SMS + payment keys
- [ ] HTTPS reverse proxy
- [ ] Backup Postgres
- [ ] CI green on main

## Mapping: mini API → Nest routes

| Feature | Mini | Nest |
|---|---|---|
| OTP | `/auth/otp/*` | same |
| Map | `/map/vendors` | same + PostGIS |
| Orders | `/orders/*` | Prisma + state machine |
| Payments | `/orders/:id/pay` | gateways + webhooks |
| Admin | `/admin/overview` | implement on Nest admin module |
