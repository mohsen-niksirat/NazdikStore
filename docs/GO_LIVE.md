# NazdikStore — Go-live checklist (P26)

> Online **deploy is last**. This checklist is ready when you choose a host.

## A. Accounts you create
- [ ] GitHub repo (done — public `mohsen-niksirat/NazdikStore`)
- [ ] Hosting: Railway **or** Render **or** Fly **or** VPS
- [ ] SMS provider (Kavenegar / SMS.ir) — optional for demo
- [ ] Payment PSP (Zarinpal / Saman) — optional for demo

## B. Demo deploy (recommended first)
```bash
# API — mini server (stable)
cd apps/api && npm run start:local   # PORT from env, default 4000

# Web
cd apps/web && npm run dev           # NEXT_PUBLIC_API_URL → API
```

`apps/api/Dockerfile` + `apps/web/Dockerfile` + `docker-compose.demo.yml`

## C. Env to paste on the host
From `.env.production.example`:
- `PORT`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`
- `ALLOW_DEV_LOGIN=0` (production)
- `JWT_ACCESS_SECRET`, `PAYMENT_HMAC_SECRET`
- `SMS_PROVIDER` + keys when ready
- `PAYMENT_PROVIDER` + keys when ready
- `DATABASE_URL` only if using real Postgres

## D. After first URL works
- [ ] Open `/tour` and walk the flow
- [ ] `/health` returns ok
- [ ] `/orders` pay + receipt works
- [ ] `/track` assign courier
- [ ] `/admin` login + metrics
- [ ] CORS matches the web origin

## E. Full Nest+Postgres (later)
See `docs/NEST_POSTGRES.md` + `docker-compose.prod.yml`  
Requires Docker (or a server image) + completed `npm install`.

## F. Verify command (local)
```bash
cd apps/api && npm run verify
```
