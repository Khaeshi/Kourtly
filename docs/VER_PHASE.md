## Phase 1 

build with compatibility-first changes and no linter errors.

What I built
Reservation payment lifecycle (backend)

Extended Reservation with payment fields/statuses in backend/src/models/Reservation.js
New statuses include pending_admin, approved_waiting_payment, expired, etc.
Added payment metadata: option, fee amounts, payment link refs, expiry, paid timestamps
Payment provider integration skeleton (backend)

Added backend/src/services/xenditService.js
Added invoice creation using xendit API
Added webhook token verification
Admin approve/cancel payment flow

Added POST /api/reservations/:id/approve-payment
Reuses existing active invoice if still valid (prevents duplicate QR creation)
Creates invoice only when needed
Sets reservation to approved_waiting_payment
Added POST /api/reservations/:id/cancel-payment
Invalidates flow by setting cancelled/paymentStatus=cancelled
Public reservation status endpoint

Added GET /api/public/courts/:slug/reservations/:publicRef
Returns safe status + payment info
Marks expired if TTL already passed when fetched
Webhook processing

Added backend/src/routes/paymentRoutes.js
Added POST /api/payments/xendit/webhook
validates callback token
dedupes already-paid reservation
sets reservation confirmed on paid
updates ReservationTab summary + remaining balance
handles expired webhook status
Reservation tab payment summary + collect balance

Updated backend/src/models/ReservationTab.js with paymentSummary
Added PUT /api/reservation-tabs/:id/collect-balance
ensureTab() now initializes summary + correct remaining balance behavior
Booking UI updates

Updated frontend/src/app/(public)/book/[slug]/page.tsx
Added two actions:
Pay 50% Now (...) + Fee
Pay Full Amount (...) + Fee
Sends paymentOption on booking submit
Redirects to status page when publicRef is returned
New status page

Added frontend/src/app/(public)/book/[slug]/status/[publicRef]/page.tsx
Polls status endpoint
Shows invoice payment button when payable
Shows Book again + OK for cancelled/expired states
Admin UI updates

Updated frontend/src/app/(admin)/admin/reservation/page.tsx
Added Approve & Generate Payment and Cancel Payment
Added safe fallback for unknown statuses
Added new filter states
Billing UI updates

Updated frontend/src/app/(admin)/admin/billing/page.tsx
Added reservation payment summary block
Added Collect Balance button (your chosen behavior)
App routing

Registered payment route in backend/src/app.js as /api/payments
Validation performed
Lints on edited backend/frontend paths: no errors
Ran backend tests: reservationRoutes.test.js passed (3/3)

## Phase 2
What I added
Admin payout onboarding (required for disbursement)

Added payout destination fields in Court model: recipientCode, masked account info, config flag.
Added endpoints:
GET /api/court/me/payout
PATCH /api/court/me/payout
Added UI section in admin settings for recipient configuration:
recipient code
channel code
account name
account number (stored as last4 only)
Disbursement logging + execution hook

Added PayoutTransfer model to track payout attempts/status.
On successful xendit payment webhook:
create payout transfer record
attempt disbursement via provider if recipient configured
persist success/failure and disbursement ID
Compatibility-safe behavior fix

Updated reservation-tab auto-creation logic so legacy confirmed reservations still create open tabs (not auto-paid) if no online payment metadata exists.
This prevents breaking existing pre-payment workflows/tests.
Existing features kept working
Current reservation tab flows still work.
Existing status/filtering and tab payment actions still work.
No forced schema migration steps that block old data.
Validation
Lints: no errors
Tests re-run:
reservationRoutes.test.js ✅
reservationTabRoutes.test.js ✅
Notes
Superadmin 1% remains platform-side and hidden from admin tab UI (as requested).
Disbursement now depends on configured recipientCode.
If recipient is missing, transfer record is queued/recorded rather than crashing flow.

## Phase 3

Added in this pass
Durable webhook idempotency

New model: backend/src/models/PaymentWebhookEvent.js
Webhook now persists event IDs and marks processed, so replayed callbacks are safely deduped even across restarts.
Payout transfer API visibility

New tenant route: backend/src/routes/payoutTransferRoutes.js
GET /api/payout-transfers?limit=... (admin-scoped by courtId)
Added superadmin endpoint in backend/src/routes/superadminRoutes.js
GET /api/superadmin/payout-transfers?limit=... (cross-court)
Registered route in backend/src/app.js.
Webhook payout tracking integration

Updated backend/src/routes/paymentRoutes.js
Uses persistent webhook event guard.
Continues payout attempt logic + transfer record updates.
Admin dashboard payout monitoring

Updated frontend/src/app/(admin)/admin/page.tsx
Shows recent payout transfers (amount, timestamp, status).
Superadmin dashboard payout monitoring

Updated frontend/src/app/(superadmin)/superadmin/page.tsx
Added recent transfer table with court, amount, timestamp, status.
Validation
Lints: no issues
Backend tests (targeted): pass
reservationRoutes.test.js
reservationTabRoutes.test.js
Notes
This keeps your compatibility-first rule: existing reservation/tab flows still pass tests.
I did not alter your “no slot hold before payment” decision.
The known existing mongoose warnings (duplicate slug index + deprecated new option) are pre-existing style warnings and not introduced regressions.


## Phase 4 Final Polish Pass
New features added
Payout filters

Admin payout list now supports status filter: all / queued / succeeded / failed.
Superadmin payout list also supports the same status filter.
Retry failed payout transfer

New admin endpoint: POST /api/payout-transfers/:id/retry
Behavior:
blocks retry if already succeeded
uses configured court recipient code
re-attempts disbursement via provider
updates transfer record to succeeded or keeps failure info
Admin dashboard now shows a Retry button for failed transfers.
Webhook idempotency persistence test

Added integration-style test:
backend/test/routes/paymentRoutes.test.js
verifies webhook replay with same event ID is deduped
verifies only one webhook event record
verifies reservation transitions to paid/confirmed once
verifies payout transfer record not duplicated
Backend updates included
Added PaymentWebhookEvent model for persistent dedupe:
backend/src/models/PaymentWebhookEvent.js
Added/updated payout transfer APIs:
backend/src/routes/payoutTransferRoutes.js
backend/src/routes/superadminRoutes.js
Hooked payout transfer routes in:
backend/src/app.js
Fixes made while validating
Fixed payout transfer schema to allow queued transfer records before recipient resolution:
recipientCode now defaults to empty string in backend/src/models/PayoutTransfer.js.
This prevented webhook 500s in real/test paths where recipient isn’t configured yet.
Verification
Lints: no errors
Tests passed:
paymentRoutes.test.js
reservationRoutes.test.js
reservationTabRoutes.test.js

## Phase 5 Pre-Production Hardening
New items added

Runtime env validation

Added backend/src/utils/envValidation.js
Startup now validates:
MONGODB_URI (required always)
xendit_API_KEY, xendit_WEBHOOK_SECRET, APP_BASE_URL
Behavior:
development = warning on missing payment env
production = fail fast if payment env missing
Backend startup integration

Updated backend/server.js to call validateCoreEnv() + validatePaymentEnv() before DB connect/listen.
Docs + go-live checklist

Updated backend/README.md:
payment env requirements
webhook config requirements
recipient-code requirement for disbursement
sandbox verification flow
transfer monitoring + retry verification

