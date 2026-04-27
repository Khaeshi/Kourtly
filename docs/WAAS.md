### **What I changed**

- Added a payment provider abstraction entrypoint at `backend/src/lib/payments/index.js`
  - New exported API:
    - `createPaymentLink(...)`
    - `verifyWebhookSignature(...)`
    - `getPaymentProvider()`
  - Supports `PAYMENT_PROVIDER=xendit` now.
  - `PAYMENT_PROVIDER=cocoart` is stubbed with explicit “not implemented yet” error (so we can plug Cocoart in cleanly next without touching routes again).
- Updated `backend/src/routes/reservationRoutes.js`
  - Replaced direct `createInvoice(...)` usage with `createPaymentLink(...)`.
  - Fixed redirect path generation to use actual public route shape:
    - `/book/${court.slug}/status/${reservation.publicRef}`
  - It now resolves the `court.slug` from `courtId` before creating payment link.
- Updated `backend/src/routes/paymentRoutes.js`
  - Replaced direct webhook auth call with provider abstraction:
    - `verifyWebhookSignature(req.body, req.headers)`

### **Validation**

- Backend tests pass:
  - `10/10` test suites, `32/32` tests passed.
- Lints on edited files: no issues found.

### **Notes from your environment changes**

- I see your `npm install` and audit updates touched lockfiles and many `node_modules` entries (expected).
- Agree on deferring the remaining moderate frontend vulnerabilities for last; no need to force-break deps now.

### **Best next step (recommended)**

I can proceed immediately with **Phase 2 hardening slice** next:

1. Add canonical reservation/payment transition guards (prevent invalid jumps),
2. Add provider metadata support to webhook processing (prep for Cocoart),
3. Add configurable hold window (`PAYMENT_HOLD_MINUTES`) and expiration cron route-safe behavior.

- Updated `frontend/src/app/(admin)/admin/settings/page.tsx`
  - `Payout Destination (Xendit Recipient)` → `Payout Destination (Cocoart Recipient)`
  - hint text now says `Provided by Cocoart recipient setup`

### **Validation completed**

- Backend tests passed again: `10/10` suites, `32/32` tests.
- Lints for edited files: no errors.

### **Current migration state**

The active payment flow is now Cocoart-based in backend/frontend:

- New service: `backend/src/services/cocoartService.js`
- Xendit service removed: `backend/src/services/xenditService.js` deleted
- Webhook endpoint changed to `/api/payments/cocoart/webhook`
- Reservation payment fields moved from `xendit`* to generic:
  - `paymentLinkId`, `paymentUrl`, `paymentQrString`
- Frontend status page now reads `paymentUrl` instead of `xenditInvoiceUrl`
- Env validation switched to:
  - `COCOART_API_KEY`
  - `COCOART_WEBHOOK_SECRET`
  - `APP_BASE_URL`

### **What I implemented**

#### **Backend realtime foundation**

- Added Socket.IO server bootstrap in `backend/server.js`:
  - HTTP server wrapper via `createServer(app)`
  - Socket.IO CORS config
  - room join on connect using `court:{courtId}`
  - `app.set('io', io)` for route access
- Added central emitter helper:
  - `backend/src/lib/emitCourtEvent.js`

#### **Backend route emit wiring**

I added court-scoped emits after mutations in:

- `backend/src/routes/queueRoutes.js` → `queue:updated`
- `backend/src/routes/tabRoutes.js` → `billing:tab_updated`, `billing:tab_paid`, `analytics:refresh`
- `backend/src/routes/reservationRoutes.js` → `reservation:updated`, `analytics:refresh`
- `backend/src/routes/reservationtabRoutes.js` → `billing:tab_updated`, `billing:tab_paid`, `reservation:updated`, `analytics:refresh`
- `backend/src/routes/playerRoutes.js` → `players:updated`
- `backend/src/routes/itemRoutes.js` → `items:updated`
- `backend/src/routes/scheduleRoutes.js` → `schedule:updated`
- `backend/src/routes/paymentRoutes.js` (webhook path) → room emits by reservation court id (`reservation:updated`, `billing:tab_updated`, `analytics:refresh`)

#### **Frontend socket client + hook**

- Added singleton socket client:
  - `frontend/src/lib/socket.ts`
- Added hook:
  - `frontend/src/hooks/useSocketEvent.ts`

#### **Admin layout mount/unmount**

- Updated `frontend/src/app/components/admin/AdminLayoutClient.tsx`
  - connects socket on admin mount via session courtId
  - disconnects on unmount

#### **Admin pages realtime refetch-on-event**

- `frontend/src/app/(admin)/admin/queue/page.tsx`
- `frontend/src/app/(admin)/admin/billing/page.tsx`
- `frontend/src/app/(admin)/admin/reservation/page.tsx`
- `frontend/src/app/(admin)/admin/players/page.tsx`
- `frontend/src/app/(admin)/admin/items/page.tsx`
- `frontend/src/app/(admin)/admin/schedule/page.tsx`

### **Dependencies added**

- Backend: `socket.io`
- Frontend: `socket.io-client`

### **Validation**

- Backend tests: **pass** (`10/10` suites, `32/32` tests).
- Lint on edited files via diagnostics tool: no new diagnostics there.
- Full frontend `eslint` still fails due to **many pre-existing repo-wide issues** (not introduced by this slice), including existing strict hook rule violations and no-explicit-any across multiple files.

