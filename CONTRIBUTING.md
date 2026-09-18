# Contributing to NazdikStore

Thanks for reviewing — the repo is public on purpose.

**Short path for friends:** open [`REVIEW_GUIDE.md`](REVIEW_GUIDE.md), run the 5-minute demo, then file an issue with **First-look checklist**.

## Quick review (no install)

Read:
- `REVIEW_GUIDE.md` — how to click through the product
- `README.md` — run guide + demo logins
- `ROADMAP.md` — phases 6–10
- `DESIGN.md` — visual system
- `Prompt 01.txt` — original brief

Open an issue with **First-look**, **Review / feedback**, or **Bug report**.

## Local demo

```bash
git clone https://github.com/mohsen-niksirat/NazdikStore.git
cd NazdikStore
```

**API**
```bash
cd apps/api
npm run dev   # http://127.0.0.1:4000
```

**Web**
```bash
cd apps/web
npm run dev   # often :3300 (port 3000 may be reserved on Windows)
```

Use in-app **demo login** buttons (`/vendor`, `/cart`, `/admin`, `/messages`).

OTP codes print in the API terminal (`[SMS] ...`).

## Tests

```bash
node apps/api/test/run-phase1.cjs
# ... phase2–5 ...
node apps/api/test/run-phase6.cjs   # API must be running
node apps/api/test/run-phase9.cjs
```

CI runs these on every push/PR (`.github/workflows/ci.yml`).

## Production notes

- `NODE_ENV=production` disables `POST /auth/dev-login`
- Set real secrets via env — never commit `.env`
- SMS: `SMS_PROVIDER=kavenegar` + `SMS_API_KEY`
- Payments: `PAYMENT_PROVIDER=zarinpal|saman` + `PAYMENT_HMAC_SECRET`

## PRs

Keep PRs small; describe *why*. Match Persian UI copy style (plain verbs, no marketing fluff).
