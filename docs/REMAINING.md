# NazdikStore — remaining implementation checklist (v4.1)

Online deploy is **deferred to last** (user choice).

## Done locally
| Area | Status |
|---|---|
| Phases 1–5 (brief) | ✅ |
| Product + Production 6–10 | ✅ |
| Enterprise 11–18 APIs | ✅ |
| Enterprise UI (search/track/assistant/settings) | ✅ |
| Theme boot + data saver | ✅ |
| Coupon redeem at checkout | ✅ |
| Orders → track link | ✅ |
| Admin KYC approve/reject | ✅ |
| CI includes enterprise suites | ✅ |

## Last (online deploy — user)
1. Choose Railway / Render / Fly / VPS  
2. Create account + connect `NazdikStore`  
3. Paste env from `.env.production.example`  
4. Deploy **mini API** (`apps/api/Dockerfile` or `npm run start:local`)  
5. Deploy **web** with `NEXT_PUBLIC_API_URL` pointing to API  

Configs ready: `docker-compose.demo.yml`, `apps/*/Dockerfile`, `docs/NEST_POSTGRES.md`

## How to run everything locally
```bat
:: API :4000
cd apps\api && npm run dev

:: Nest experiment :4100 (optional)
node scripts\nest-direct.cjs

:: Web
cd apps\web && npm run dev
```

Open `/tour` for full walkthrough.
