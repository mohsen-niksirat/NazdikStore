# NazdikStore — نزدیک استور

Hyperlocal multi-vendor marketplace for the Iranian market.

**Public repo** — friends welcome to review:  
https://github.com/mohsen-niksirat/NazdikStore

**شروع بررسی:** [REVIEW_GUIDE.md](REVIEW_GUIDE.md) · [تور دمو در سایت](apps/web/src/app/tour/page.tsx) (`/tour`)  
Issue template: **First-look checklist**

## Release map

| Version | What |
|---|---|
| Phase 1–5 | Auth, map, feed/reviews, transactions, payments |
| **v0.6.0** | Vendor dashboard + CSS design system |
| **v0.7.0** | Consumer cart & checkout |
| **v0.8.0** | Admin console |
| **v0.9.0** | Order chat + notifications |
| **v1.0.0** | PWA install, release checklist |
| **v1.3–1.7** | RFQ, profile, admin data, map deep-link |
| **v1.8–1.9** | Friend review kit + in-app demo tour |

## How to run (local demo)

```bat
:: Terminal 1 — API (port 4000)
cd apps\api
npm run dev

:: Terminal 2 — Web (port 3300 or 5000; 3000 reserved on some Windows)
cd apps\web
npm run dev
```

Open: `http://127.0.0.1:3300` (or the port printed by Next).

| Page | Path |
|---|---|
| Home | `/` |
| Map | `/map` |
| Auth OTP | `/auth` |
| Feed | `/feed` |
| Vendor panel | `/vendor` |
| Cart / checkout | `/cart` |
| Admin | `/admin` |
| Chat & alerts | `/messages` |
| Appointments / RFQ | `/book` |

**Docker demo** (when Docker is installed):
```bash
docker compose -f docker-compose.demo.yml up --build
# API :4000  Web :3300
```

**Nest + Postgres (v2 production):** see [`docs/NEST_POSTGRES.md`](docs/NEST_POSTGRES.md)

**Demo logins** (no SMS): use the buttons on `/vendor`, `/cart`, `/admin`, `/messages` — they call `POST /api/v1/auth/dev-login`.

OTP codes print in the API terminal as `[SMS] …`.

## Production checklist

- [ ] Copy `.env.production.example` → `.env` (never commit `.env`)
- [ ] `ALLOW_DEV_LOGIN=0` and `NODE_ENV=production` (dev-login API returns 403)
- [ ] `SMS_PROVIDER=kavenegar` or `smsir` + API key
- [ ] `PAYMENT_PROVIDER=zarinpal` or `saman` + `PAYMENT_HMAC_SECRET` + merchant key
- [ ] Docker: `docker compose up -d postgres redis` then `prisma migrate deploy`
- [ ] HTTPS + reverse proxy (CSP in Nest `main.ts`)
- [ ] Full Nest path when npm install is complete: `npm run dev:nest`
- [ ] CI green on GitHub Actions (`.github/workflows/ci.yml`)

## For reviewers (public repo)

- Clone, run demo (API + web), open issues via templates
- `CONTRIBUTING.md` has the review path
- Tags: `v0.6.0` … `v1.0.0`

## Tests

```bash
node apps/api/test/run-phase1.cjs
node apps/api/test/run-phase2.cjs
node apps/api/test/run-phase3.cjs
node apps/api/test/run-phase4.cjs
node apps/api/test/run-phase5.cjs
# API must be running:
node apps/api/test/run-phase6.cjs
node apps/api/test/run-phase9.cjs
```

## Stack

NestJS + Prisma + PostgreSQL/PostGIS · Next.js · Redis OTP/JWT · payment gateways (Zarinpal/Saman/mock) · Map engine with fuzzy home locations.

See `ROADMAP.md` and `DESIGN.md` and `Prompt 01.txt` (original brief).


## Stack

| Layer | Tech |
|---|---|
| Backend | NestJS 11 + Prisma + PostgreSQL (+PostGIS) + Redis |
| Frontend | Next.js App Router + Tailwind + MapLibre (Phase 2) |
| Auth | SMS OTP + JWT (15m access) + rotating refresh (HttpOnly) |
| Shared | `@nazdik/shared` — phone utils, roles, error envelopes |

## How to run

### Offline / no Docker (works now)

```bash
# API only — in-memory engines, demo data, port 4000
cd apps\api
npm run start:local
# or npm run dev   → alias for start:local in offline mode is NOT nest
# use:
node test\mini-server.cjs

# From repo root:
npm run api:local
```

Live endpoints (already verified):
- `GET http://localhost:4000/api/v1/health`
- `GET http://localhost:4000/api/v1/map/vendors?lat=35.6892&lng=51.389&radiusKm=5`
- `GET http://localhost:4000/api/v1/feed`
- `GET http://localhost:4000/api/v1/vendors/vp_food_1/profile`
- `POST http://localhost:4000/api/v1/auth/otp/request`

Frontend (needs `next` install):

```bash
cd apps\web
npm run dev
# → http://localhost:3000  (pages call the API on :4000)
```

### Full Nest + Postgres (production path)

```bash
# From REPO ROOT (not apps/api) — scripts live in the root package.json
npm run dev:api     # nest start --watch  → :4000
npm run dev:web     # next dev -p 3000    → :3000
npm run test        # all phase suites

# Inside each app folder the same commands are also named:
cd apps\api && npm run dev          # nest
cd apps\api && npm run start:local  # offline mini API
cd apps\web && npm run dev          # next
```

**Do not run `npm run dev:api` inside `apps\api`** — that name only exists on the root (and as an alias now on the app). From `apps\api` use `npm run dev` or `npm run start:local`.

Infra:

```bash
docker compose up -d postgres redis
cd apps/api && npx prisma migrate deploy && npx prisma generate
```

Swagger: `http://localhost:4000/api/docs` (full Nest only)

## Quick start (legacy note)

```bash
# 1. Install
npm install

# 2. Build shared package
npm run build --workspace=@nazdik/shared

# 3. Infrastructure (requires Docker)
cp .env.example .env
docker compose up -d postgres redis

# 4. Database
cd apps/api
npx prisma generate
npx prisma migrate deploy

# 5. Run
npm run dev:api    # http://localhost:4000/api
npm run dev:web    # http://localhost:3000
```

Swagger: `http://localhost:4000/api/docs`

## Tests (no Docker/DB required)

```bash
npm test
# or directly:
node apps/api/test/run-phase1.cjs
```

The standalone runner compiles TypeScript on the fly and executes 39 Phase 1
assertions (phone, OTP rate-limit/single-use, JWT rotation, RBAC, vendor
profile rules, localized errors). Jest configs are also present for CI once
dependencies are fully installed.

Phase 1 unit tests cover:
- Iranian phone validation / normalization
- OTP issuance, verification, single-use, TTL, rate limits (3 / 5 min / phone+IP)
- JWT access payload + refresh rotation + revoke
- RBAC guard (CONSUMER / VENDOR / ADMIN)
- Vendor profile completion + national ID check-digit
- Localized (fa/en) error envelopes

## Phase 5 API (payments, wallet, notifications)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/orders/:orderId/pay` | consumer | Start payment (`Idempotency-Key` header) |
| POST | `/api/v1/payments/webhook` | signed | Bank callback — idempotent ledger credit |
| GET | `/api/v1/payments/callback` | public | Browser return URL → redirect to web |
| GET | `/api/v1/payments/:id` | bearer | Payment status |
| POST | `/api/v1/payments/:id/refund` | bearer | Refund (idempotent if already refunded) |
| GET | `/api/v1/wallet/me` | bearer | Consumer wallet + ledger |
| GET | `/api/v1/wallet/vendor/me` | bearer | Vendor wallet + settlements |
| GET | `/api/v1/notifications/health` | public | Realtime transport status |

**Providers:** `mock` · `zarinpal` · `saman`/`pasargad` (abstract `PaymentGateway`).

**Idempotency:** repeated `Idempotency-Key` on `/orders/:id/pay` returns the same payment; webhook `eventKey` dedup + ledger keys ensure **replayed bank webhooks never double-credit**.

**Settlement:** platform commission default **10%** (`PLATFORM_COMMISSION_BPS`); vendor credit = gross − commission; refunds debit vendor/platform then credit consumer wallet.

**Security:** Helmet CSP with `frameAncestors 'none'`, HSTS, nosniff, Swagger at `/api/docs`.

## Phase 4 API (transactions)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/vendors/me/schedule` | vendor | Weekly calendar + breaks + slot length |
| GET | `/api/v1/vendors/:id/slots` | public | Free/booked slots for a day |
| POST | `/api/v1/orders/appointments` | consumer | Atomic slot booking (409 if taken) |
| POST | `/api/v1/orders/delivery` | consumer | Cart checkout (stock + zone) |
| POST | `/api/v1/jobs` | consumer | RFQ job request |
| POST | `/api/v1/jobs/:id/quotes` | vendor | Submit quote |
| GET | `/api/v1/jobs/:id/quotes` | party | List quotes |
| POST | `/api/v1/jobs/:id/quotes/:qid/accept` | consumer | Lock bid → RFQ order |
| GET | `/api/v1/orders/me` | consumer | My orders |
| GET | `/api/v1/orders/vendor/me` | vendor | Vendor orders |
| POST | `/api/v1/orders/:id/transitions` | party | State machine advance |

**State machine:** `PENDING_ACCEPTANCE → PREPARING|SCHEDULED → IN_PROGRESS → COMPLETED|DISPUTED`; `CANCELLED` terminal. Invalid moves → `INVALID_TRANSITION` 409.

**COMPLETED** writes `CompletedEngagement` → unlocks Phase 3 reviews.

## Phase 3 API (feed, media, reviews)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/feed` | public | Local social feed |
| GET | `/api/v1/vendors/:id/profile` | public | Bio, posts, products, review summary |
| GET | `/api/v1/vendors/:id/reviews` | public | Verified reviews + average |
| POST | `/api/v1/media/upload` | bearer | Image upload (magic bytes, 5MB, EXIF strip) |
| POST | `/api/v1/vendors/me/posts` | vendor | Create timeline post |
| POST | `/api/v1/vendors/me/products` | vendor | Create catalogue item |
| POST | `/api/v1/vendors/:id/reviews` | consumer | Review — **requires completed engagement** |
| POST | `/api/v1/vendors/me/reviews/:id/reply` | vendor | Public reply |

**Review gate:** only users with a `CompletedEngagement` (order/appointment) may rate. Phase 4 order engine will write the same table on completion.

**Media safety:** magic-byte MIME (jpeg/png/webp), polyglot/script reject, path-traversal sanitize, JPEG EXIF/GPS strip.

Frontend: `/feed` · `/vendors/:id`

## Phase 2 API (map engine)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/map/vendors` | public | bbox / radius / cluster / fuzzy pins |
| GET | `/api/v1/map/config` | public | radius presets, fuzzy radius, default center |
| GET | `/api/v1/vendors/me/location` | bearer | my pin |
| PUT | `/api/v1/vendors/me/location` | bearer | create/update pin |
| PATCH | `/api/v1/vendors/me/location/privacy` | bearer | toggle home-based fuzzy mode |

Query params for `map/vendors`:
- `lat`, `lng`, `radiusKm` (1 \| 3 \| 5 \| 10 presets)
- `bbox=minLng,minLat,maxLng,maxLat`
- `vendorType`, `zoom`, `limit`, `exact=1`

**Fuzzy Location Mode:** home-based vendors return `lat/lng: null`, a `displayLat/Lng` offset ≤200m, and a `fuzzyPolygon` circle. Exact coordinates never leave the server until order confirmation (Phase 4+).

Frontend map: `http://localhost:3000/map` (canvas fallback; MapLibre optional upgrade).

## Phase 1 API

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/otp/request` | public | Request SMS OTP |
| POST | `/api/v1/auth/otp/verify` | public | Verify OTP → tokens |
| POST | `/api/v1/auth/refresh` | public (cookie/body) | Rotate refresh token |
| POST | `/api/v1/auth/logout` | bearer | Revoke session |
| POST | `/api/v1/auth/profile/complete` | bearer | Consumer/vendor profile |
| GET | `/api/v1/users/me` | bearer | Current profile |
| PATCH | `/api/v1/users/me` | bearer | Update name/avatar |
| GET | `/api/v1/vendors` | public | Verified vendor directory |
| GET | `/api/v1/health` | public | Health check |

## Roles

- `CONSUMER` — service receiver
- `VENDOR` — provider (`MEDICAL` \| `FOOD` \| `ECOMMERCE` \| `FIELD_SERVICE` \| `BEAUTY`)
- `ADMIN` — platform operator (cannot be self-assigned)

## Project layout

```
apps/api      NestJS backend (Phase 1 complete)
apps/web      Next.js storefront (auth UI)
packages/shared  Shared types & validators
DESIGN.md     Product visual system
Prompt 01.txt Original mission brief
```

## Roadmap

- **Phase 1** ✅ Auth, RBAC, profiles
- **Phase 2** ✅ PostGIS map engine, fuzzy locations, clustering, map UI
- **Phase 3** ✅ Feed, media pipeline, purchase-gated reviews, vendor profile UI
- **Phase 4** ✅ Time-slots, cart/delivery, RFQ bidding, order state machine
- **Phase 5** ✅ Payments, idempotency, webhooks, wallet/settlement, notifications, hardening

## Test totals (offline, no Docker required)

```
Phase 1  39  phone, OTP rate-limit, JWT rotate, RBAC, profiles
Phase 2  19  geo, fuzzy privacy, map queries, clustering, 10k scan
Phase 3  21  media magic-bytes, polyglot reject, gated reviews, feed
Phase 4  21  state machine, atomic slots (1×409), cart, RFQ lock
Phase 5  14  idempotent pay, webhook replay no double-credit, e2e settle
────────
Total  114 passed
```

```bash
npm test
# or per phase:
node apps/api/test/run-phase5.cjs
```
- **Phase 4** Appointments, orders, RFQ engine
- **Phase 5** Payments (Zarinpal/Saman), webhooks, notifications
