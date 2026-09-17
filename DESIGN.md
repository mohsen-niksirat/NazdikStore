# NazdikStore — Product Design Spec

## Identity
Product UI Designer for a hyperlocal Iranian multi-vendor marketplace — the 90% state is "I need something near me, now."

## Grounding
Assumption: NazdikStore is not a generic e-commerce clone. The brand thesis is **نزدیک** (nearby) — proximity is the product. Visual system should feel like a modern neighborhood bazaar: warm, trustworthy, map-aware — not cold SaaS, not Instagram clone. Deliverable for Phase 1: auth + role selection + profile foundation, designed as the first screen of a local commerce super-app.

---

## 1. Objective
Make Iranian users trust a phone-only login in under 30 seconds, then land them in a role-aware shell (consumer / vendor / admin) that already feels like "nearby commerce," not a tech demo.

## 2. Product Context
- **Audience**: Iranian consumers ordering food/services; home-based vendors; clinic/salon operators; field-service technicians.
- **Market constraints**: Persian-first UI (RTL), phone = identity, no Google/Facebook login, SMS OTP as primary auth, Shaparak payment later.
- **Vendor taxonomy (drives future UI):** Medical/Visit · Food/E-commerce · Field-Service/Quote · Beauty/Time-slot.

## 3. Visual Foundations

### Palette
| Token | Hex | Role |
|---|---|---|
| `--paper` | `#F7F4EF` | App background — warm parchment, not pure white |
| `--ink` | `#1C2421` | Primary text — deep green-black |
| `--ink-muted` | `#5C6B66` | Secondary text |
| `--accent` | `#0F6B5C` | Primary action — bazaar teal (trust + locality) |
| `--accent-soft` | `#D8ECE7` | Soft teal fills / selected states |
| `--gold` | `#C4922A` | Verification / vendor badges only — never CTAs |
| `--danger` | `#B42318` | Errors / failed OTP |
| `--line` | `#E2DDD4` | Hairline borders |

### Typography
- **Display / UI Persian**: `Vazirmatn` (self-hosted or system fallback `"Vazirmatn", "Segoe UI", Tahoma, sans-serif`)
- **Latin / codes**: `ui-monospace, "Cascadia Code", Consolas, monospace` for OTP digits, phone numbers
- **Scale**: 12 / 14 / 16 / 20 / 28 / 40 — body 16/1.7 for Persian readability
- **Weights**: 400 body, 500 labels, 700 headings — no ultra-light (RTL thin Persian is hard to read)

### Layout system
- Mobile-first, 375px baseline
- Auth: single column, max-width 400px, generous top space (logo → form)
- App shell later: bottom nav + map-first home
- Spacing rhythm: 4-based (4/8/12/16/24/32/48)
- Radius: 12px cards, 10px inputs/buttons — soft but not bubbly

### Signature element
**Proximity chip** — a small pill used across the product showing distance (`۱٫۲ کیلومتر`) with a subtle teal pulse. Phase 1 uses a static version under the logo as brand promise: `فروشگاه‌های نزدیک شما`.

### Risk taken
Warm parchment + deep teal instead of the default white/purple marketplace look. Tradeoff: less "tech-startup cool," more "I can trust this neighborhood shop."

## 4. Accessibility
- Body contrast ≥ 4.5:1 on `--paper`
- Focus-visible: 2px teal ring, never `outline: none`
- OTP inputs: `inputmode="numeric"`, `autocomplete="one-time-code"`
- All interactive targets ≥ 44×44px
- Errors announced via `role="alert"`

## 5. Voice & Tone
- **fa-IR default**, English secondary in error codes only
- Plain verbs: «کد تایید را وارد کنید» not «لطفاً کد ارسال‌شده را در فیلد مربوطه درج نمایید»
- Errors tell the user what to do next («۲ دقیقه دیگر دوباره تلاش کنید»)
- No fake urgency, no emoji decoration

## 6. Implementation Practices
- Next.js App Router + Tailwind v4 / CSS variables for tokens
- `dir="rtl"` on root; Latin phone/OTP digits kept LTR islands
- API error envelopes: `{ success, error: { code, message, messageEn } }`
- Tokens defined once in `globals.css` — components never hardcode hex

## 7. Anti-Patterns (explicit refusals)
- No purple-blue gradient heroes
- No emoji-bullet feature grids
- No generic "seamless marketplace" marketing copy on auth screens
- No Instagram-clone feed chrome in Phase 1
- No pure `#FFFFFF` page background
- No long Persian paragraphs in error toasts

## 8. Decision-Making
When stuck: **trust + speed for Iranian mobile users** beats visual novelty. Prefer one clear action per screen.

## 9. Workflow
Phase 1 ships: monorepo, NestJS auth API, Next.js auth UI, tests. Phases 2–5 inherit this DESIGN.md; map/feed/payments may add tokens but must not contradict palette/type.

---

## Phase 1 UI structure

### Screen A — Phone entry
- Logo wordmark «نزدیک استور» + proximity chip
- Phone field (ltr input, rtl label)
- CTA: «ارسال کد تایید»
- Helper: accepted formats `09xxxxxxxxx`
- Loading + rate-limit error states

### Screen B — OTP verify
- Masked phone + «ویرایش شماره»
- 5-digit OTP (mono, large)
- Resend countdown 120s
- CTA: «ورود»
- Wrong-code / expired / rate-limited states

### Screen C — Role & profile bootstrap
- After first login, if profile incomplete:
  - Role picker: «مشتری» | «فروشنده»
  - Vendor sub-type (if vendor): Medical / Food / Field / Beauty
  - Business name + national ID (vendor)
- CTA: «تکمیل پروفایل»
