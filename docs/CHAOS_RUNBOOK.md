# NazdikStore — zero-downtime / chaos runbook (Phase 18)

## Blue-green API deploy
1. Build image `nazdik-api:$SHA`
2. Start green container on :4001, healthcheck `/api/v1/health`
3. Flip reverse proxy upstream 4000 → 4001
4. Drain blue (30s), stop
5. Keep previous image for instant rollback

## Redis outage
- `CacheCircuitBreaker` opens after 5 failures → memory/DB fallback
- OTP + rate limits degrade to in-process (dev) / sticky DB (prod)
- Alert when `circuit.isOpen`

## SMS gateway outage
- `SmsCircuitBreaker`: primary fails 3× → open 2s → auto-switch fallback
- Never drop OTP request: try all registered providers
- Metric: `sms.switch.count`

## Database
- Daily `scripts/backup-postgres.sh` (gzip + media tarball, retain 14)
- `VACUUM (ANALYZE)` weekly; `REINDEX` on alert bloat
- Migration runner: `docker compose --profile migrate run migrate`

## Load targets
- P99 API < 120ms at 1k RPS burst (health/map)
- Script: `bash scripts/load-smoke.sh http://127.0.0.1:4000/api/v1 500`
