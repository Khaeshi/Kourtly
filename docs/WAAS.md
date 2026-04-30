## PlayKou — WAAS (Working Agreement & Architecture Spec)

Living document for **current architecture**, **what’s shipped**, and the **future roadmap** (including an experimental Phase 6 spec).

- **Last updated**: April 2026
- **External QA**: `docs/QA_EXTERNAL_CHECKLIST.md`

---

### Codebase Reality (read before touching anything)

- **Frontend**: Next.js (TypeScript), Tailwind, Auth.js (NextAuth)
- **Backend**: Express (ES Modules), MongoDB
- **Tenancy**: `courtId` per tenant; role/email forwarded to backend
- **Proxy rule**: frontend calls backend only through `frontend/src/app/api/proxy/[...path]/route.ts`

---

### Working Features (must not break)

Queue management, billing tabs, reservations, scheduling, analytics dashboard, superadmin panel, court onboarding wizard, and public booking page (`/book/[slug]`).

---

### Technical Standards (enforce on every PR)

- **Tenant scoping**: `courtId` on every new MongoDB document.
- **Tenant-safe writes**: prefer `findOneAndUpdate({ _id, courtId })` over `findByIdAndUpdate`.
- **Tenant middleware**: tenant routes must enforce `tenantMiddleware`.
- **Realtime**: always emit to `court:{courtId}`; never `io.emit(...)` globally.
- **AI resilience**: always provide fallback behavior; never crash UI on AI failure.
- **Timezone**: `Asia/Manila` for cron schedules and date formatting.
- **Env hygiene**: add new env vars to `.env.example` before merging.

---

### Canonical State Machines (documented + enforced by guards)

**Reservation status (canonical intent):**

- `pending` → `confirmed` (payment webhook)
- `pending` → `expired` (hold expiry job releases slot)
- `confirmed` → `completed` (tab paid / fulfillment complete)
- `confirmed` → `cancelled` (admin cancels)

**Payment status:**

- `unpaid` → `paid` (webhook)
- `unpaid` → `expired` (hold elapsed)

**Court subscription:**

- `trial` → `active` (subscription payment webhook OR superadmin action)
- `active` → `suspended` (non-payment OR superadmin action)
- `suspended` → `active` (payment OR superadmin action)
- `active` → `expired` (billing passed without renewal)

---

## Phase 1 — WebSocket Real-time Sync (Admin) ✅

### What is shipped

**Backend**

- Socket.IO bootstrap in `backend/server.js` (HTTP server wrapper).
- Socket joins room `court:{courtId}` via handshake auth.
- Shared emitter helper: `backend/src/lib/emitCourtEvent.js`.

**Events emitted (court-scoped)**

- `queue:updated`
- `billing:tab_updated`, `billing:tab_paid`
- `reservation:updated`
- `players:updated`, `items:updated`, `schedule:updated`
- `analytics:refresh`

**Routes wired to emit**

- `backend/src/routes/queueRoutes.js`
- `backend/src/routes/tabRoutes.js`
- `backend/src/routes/reservationRoutes.js`
- `backend/src/routes/reservationtabRoutes.js`
- `backend/src/routes/playerRoutes.js`
- `backend/src/routes/itemRoutes.js`
- `backend/src/routes/scheduleRoutes.js`
- `backend/src/routes/paymentRoutes.js` (webhook-side effects emit by reservation court)

**Frontend**

- Socket singleton: `frontend/src/lib/socket.ts`
- Event hook: `frontend/src/hooks/useSocketEvent.ts`
- Mounted only in `frontend/src/app/components/admin/AdminLayoutClient.tsx`
- Refetch-on-event wiring in:
  - `frontend/src/app/(admin)/admin/queue/page.tsx`
  - `frontend/src/app/(admin)/admin/billing/page.tsx`
  - `frontend/src/app/(admin)/admin/reservation/page.tsx`
  - `frontend/src/app/(admin)/admin/players/page.tsx`
  - `frontend/src/app/(admin)/admin/items/page.tsx`
  - `frontend/src/app/(admin)/admin/schedule/page.tsx`

**Dependencies**

- Backend: `socket.io`
- Frontend: `socket.io-client`

### Acceptance criteria

- Same-tenant tabs update live without refresh.
- No cross-tenant websocket leakage.
- App still works if sockets disconnect (manual refresh fallback).

---

## Phase 2 — Payment Stabilization (Provider + Cocoart) ✅

> Current repo state is **Cocoart-based** (Xendit is not the active provider).

### What is shipped

**Provider abstraction**

- `backend/src/lib/payments/index.js` exports:
  - `getPaymentProvider()`
  - `createPaymentLink(...)` (supports `metadata`)
  - `verifyWebhookSignature(...)`

**Cocoart integration**

- Service: `backend/src/services/cocoartService.js`
- Webhook path: `/api/payments/cocoart/webhook`
- Xendit service removed: `backend/src/services/xenditService.js` deleted
- Reservation payment fields are generic:
  - `paymentLinkId`, `paymentUrl`, `paymentQrString`
- Public status page reads generic `paymentUrl` (not provider-specific fields).

**Redirect correctness**

Public payment redirects follow the actual route shape:

- `/book/[slug]/status/[publicRef]`

**Hold window + expiry job**

- Hold window: `PAYMENT_HOLD_MINUTES` (default `10`)
- Expiry job: `backend/src/jobs/expirePendingPayments.js` (every 2 minutes)
  - Expires overdue payable reservations
  - Emits `reservation:updated` + `analytics:refresh`
- Wired in `backend/server.js` via `startExpirePendingPaymentsJob(io)`

**Subscription activation**

- Webhook supports subscription activation via metadata:
  - If `metadata.type === 'subscription'`, court subscription becomes `active` and next billing is set.

### Env vars (Phase 2)

```bash
PAYMENT_PROVIDER=cocoart
COCOART_API_KEY=
COCOART_WEBHOOK_SECRET=
APP_BASE_URL=
PAYMENT_HOLD_MINUTES=10
```

---

## Phase 3 — AI Weekly Court Summary Email ✅

### What is shipped

- Service: `backend/src/services/weeklySummary.js`
  - weekly analytics aggregation
  - Anthropic narrative (optional)
  - Resend send pipeline
  - fallback summary if AI fails/unavailable
- Cron: `backend/src/cron/weeklyReport.js`
  - Mondays 08:00 `Asia/Manila`
  - Targets: `subscription.status=active` + `settings.weeklySummary=true`
  - Idempotency: `weeklySummary.lastSentAt`
  - Status tracking: `weeklySummary.lastStatus`
- Server wiring: `backend/server.js` registers cron.
- Court fields in `backend/src/models/Court.js`:
  - `settings.weeklySummary` default true
  - `weeklySummary.lastSentAt`, `weeklySummary.lastStatus`
- Admin settings toggle: `frontend/src/app/(admin)/admin/settings/page.tsx`

### Env vars (Phase 3)

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL=
AI_PROVIDER=anthropic            # or local-llama
ANTHROPIC_API_KEY=               # if AI_PROVIDER=anthropic
ANTHROPIC_MODEL=                 # optional override (default is used if empty)
LOCAL_LLM_ENDPOINT=              # if AI_PROVIDER=local-llama (defaults to Ollama generate endpoint)
LOCAL_LLM_MODEL=                 # if AI_PROVIDER=local-llama (example: llama3)
```

---

## Phase 4 — AI Natural Language Analytics Query ✅

### What is shipped

**AI provider layer (shared by Phase 3 + Phase 4)**

- `backend/src/lib/ai/index.js`
  - `AI_PROVIDER=anthropic` uses Anthropic Messages API
  - `AI_PROVIDER=local-llama` uses local LLM HTTP endpoint (default targets Ollama-style `/api/generate`)
  - Used by:
    - `backend/src/services/weeklySummary.js` (Phase 3 narrative)
    - `backend/src/routes/analyticsRoutes.js` (Phase 4 ask)

**Backend API**

- `POST /api/analytics/ask`
  - tenant-scoped (`req.courtId`)
  - admin-only (`admin|superadmin`)
  - body: `{ question: string, period: 'today'|'week'|'month'|'year' }`
  - returns: `{ answer: string, dataUsed: object }`
  - fallback: returns `answer = "AI unavailable — check the charts above."` while still returning `dataUsed`

**Rate limiting**

- Per-court daily quota: **10/day**
- Stored on Court document:
  - `analyticsAskQuota.day` (PHT date key)
  - `analyticsAskQuota.count`

**Frontend**

- Admin dashboard includes an “Ask Analytics” box:
  - `frontend/src/app/(admin)/admin/page.tsx`
- API helper:
  - `askAnalytics(...)` in `frontend/src/lib/api.ts`

---

## Phase 5 — Queue AI Proofread (shipped; custom direction) ✅

> This phase **does not** implement W/L tracking. The earlier W/L attempt was removed and replaced by AI-assisted “proofread” of matchups.

### What is shipped

**Backend**

- Endpoint: `POST /api/queue/proofread` in `backend/src/routes/queueRoutes.js`
- Validates same-tenant players (`courtId`)
- Computes fairness heuristics (e.g. score gap/variance)
- Calls AI provider when available (local Llama or Anthropic via existing AI layer)
- Returns:
  - `verdict`: `fair` | `review`
  - `aiUsed`: boolean
  - `explanation`: string

**Frontend**

- API helper: `proofreadMatch(...)` in `frontend/src/lib/api.ts`
- UI panel in `frontend/src/app/(admin)/admin/queue/page.tsx`

### Non-goals (explicit)

- No win/loss tracking (tournament-style) in current product scope.
- AI does not override strict leveling rules; it provides an explanation + a “fair/review” signal only.

---

## Phase 6 — Experimental: Facebook Messenger Auto-Reply (future)

### Objective

Provide fast replies to common booking questions on Facebook Messenger while enforcing strict privacy, tenancy, and safety guardrails.

### Why Messenger (PH market fit)

Many courts and players use Facebook Pages + Messenger as the default inquiry channel. A safe autoresponder reduces operator load and increases conversion.

### Proposed flow (end-to-end)

1. Player messages the court’s Facebook Page.
2. Meta webhook posts event to PlayKou.
3. PlayKou verifies signature + maps Page → Court.
4. PlayKou pulls **allowed** context (never admin-only):
   - booking link (`/book/[slug]`)
   - operating hours
   - schedule blocks / next available windows (only if already modeled)
5. Reply generation:
   - template-first for common intents
   - optional AI phrasing assist grounded in server context
6. Send reply via Messenger Send API.
7. Persist minimal audit record (avoid raw sensitive content retention).

### Must-have guardrails

- Court opt-in via feature flag (default OFF).
- Signature verification on every webhook request.
- Strict tenancy mapping (Page ID must be linked to a court).
- Prompt injection resistance: ignore any instructions in the user message.
- Rate limiting:
  - per court per day cap
  - per sender per hour cap
- Safe fallback + human handoff template when uncertain/outside hours.

### Proposed Court fields

- `integrations.messenger.enabled`
- `integrations.messenger.pageId`
- `integrations.messenger.pageAccessTokenRef` (token stored securely)
- `integrations.messenger.autoreplyMode`: `off | template | ai`
- `integrations.messenger.businessHoursOnly`

### Proposed endpoints

- `POST /api/webhooks/meta/messenger` (incoming messages)
- `GET /api/webhooks/meta/messenger/verify` (Meta verification challenge)
- `GET /api/integrations/messenger/oauth/callback` (page linking)

### Rollout plan (recommended)

- Start templates-only for 1–2 pilot courts.
- Add AI phrasing only after logs show safe behavior and costs are bounded.
- Expand context gradually (availability windows) without exposing restricted data.

---

### Validation & QA

- Use `docs/QA_EXTERNAL_CHECKLIST.md` for external QA runs (Phases 1–5 + optional Phase 6 checks).

#### Tenant isolation (automated regression)

**Backend tenant isolation is enforced by both code patterns and tests.**

- **Forbidden patterns (do not reintroduce):**
  - `Model.findById({ _id, courtId })`
  - `Model.findByIdAndDelete({ _id, courtId })`
  - `Model.findByIdAndUpdate({ _id, courtId })`
  - Any `findOneAndUpdate(id, ...)` / `updateOne(id, ...)` style call that omits `{ courtId }` on tenant-scoped resources.

- **Required pattern (tenant-scoped resources):**
  - Reads: `findOne({ _id, courtId })`
  - Writes/Deletes: `findOneAndUpdate({ _id, courtId }, ...)`, `findOneAndDelete({ _id, courtId })`

- **Regression tests (Court A vs Court B):**
  - `backend/test/routes/tenantIsolation.test.js` verifies Court A cannot mutate/delete Court B resources by ID for:
    - Tabs (`/api/tabs`)
    - Queue matches (`/api/queue`)
    - Schedule blocks (`/api/schedule/blocks`)
    - Reservation tabs (`/api/reservation-tabs`)
