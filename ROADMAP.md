# NazdikStore — Product Roadmap (Phases 6–10)

Original mission brief (Prompt 01) Phases **1–5 are complete** (auth, map, feed/reviews, transactions, payments).

This document defines the **post-brief product roadmap** — what we ship next to turn the platform into a usable marketplace.

| Phase | Version | Theme | Outcome |
|---|---|---|---|
| 6 | `v0.6.0` | Vendor dashboard | Vendors manage profile, products, posts, and order status from the UI |
| 7 | `v0.7.0` | Consumer commerce | Cart, appointment booking, checkout & payment UI |
| 8 | `v0.8.0` | Admin console | Verification, platform wallet, dispute queue |
| 9 | `v0.9.0` | Realtime chat & alerts | Order chat + notification center |
| 10 | `v1.0.0` | PWA + production hardening | Installable app, seed demo, release checklist |

Each phase: implement → test → `git tag vX.Y.Z` → push to GitHub.

## Phase 6 — Vendor dashboard
- `/vendor` hub (login state via session token in localStorage for demo)
- Profile editor (business name, type, home-based fuzzy toggle)
- Product CRUD (price, stock)
- Post composer
- Order board with state transitions (PREPARING → IN_PROGRESS → COMPLETED)

## Phase 7 — Consumer commerce
- Product catalogue with add-to-cart
- Cart page + delivery checkout → create order → pay
- Appointment picker (slots from vendor schedule)
- Payment result page (`/pay/result`)

## Phase 8 — Admin
- Pending vendor verification list
- Approve/reject
- Platform wallet summary
- Open disputes

## Phase 9 — Chat & notifications
- Per-order message thread (WS facade)
- Notification bell + history

## Phase 10 — Release
- PWA manifest + icons
- `demo` seed mode documented
- Production env checklist
- Tag `v1.0.0`
