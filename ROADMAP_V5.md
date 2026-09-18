# Product V5 — Essential marketplace phases (P19–P26)

See full research: `docs/RESEARCH_V5.md`

| Phase | Status | Deliverable |
|---|---|---|
| P19 Order command center | ✅ | `/orders` pay/chat/track/receipt/dispute |
| P20 Trust | ✅ | Vendor hours open-now + privacy + review summary |
| P21 Catalog media | ✅ | Product image upload UI (JPEG/PNG ≤5MB, polyglot reject) |
| P22 Data persistence | ✅ | JSON autosave + `npm run verify` |
| P23 Address book | ✅ | `/me/addresses` + profile + cart picker |
| P24 Growth | ✅ | Home coupon banner + referral code API |
| P25 Courier/RFQ UI APIs | ✅ | `/courier/jobs` + `/rfq/open` + accept |
| P26 Go-live docs | ✅ | `docs/GO_LIVE.md` checklist |

**Online deploy remains last** (user deferred).

Online **deploy stays last** (user deferred).

## Run verify after each phase
```bat
node apps\api\test\run-p19.cjs
```
