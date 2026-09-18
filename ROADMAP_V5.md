# Product V5 — Essential marketplace phases (P19–P26)

See full research: `docs/RESEARCH_V5.md`

| Phase | Status | Deliverable |
|---|---|---|
| P19 Order command center | **in progress** | `/orders` full lifecycle actions |
| P20 Trust | pending | Vendor hours, reviews on profile, privacy FAQ |
| P21 Catalog media | pending | Product image upload UI |
| P22 Data persistence | pending | JSON store + `npm run verify` |
| P23 Address book | pending | Simple Iranian address on checkout |
| P24 Growth | pending | Referral campaign page + home banner |
| P25 Courier/RFQ UI | pending | Courier job list + RFQ accept UX |
| P26 Go-live docs | pending | `docs/GO_LIVE.md` checklist (no live deploy yet) |

Online **deploy stays last** (user deferred).

## Run verify after each phase
```bat
node apps\api\test\run-p19.cjs
```
