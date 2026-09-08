# Kourtly External QA Checklist

Last updated: April 2026  
Scope baseline: Phases 1–5 shipped (Phase 6 optional/experimental)

Use this sheet for manual external QA (browser + API tool like Postman/Insomnia + optional DB check).

---

## How to Use

- Run tests per court tenant (at least Court A and Court B).
- For each test case:
  - Mark `Status`: `PASS` / `FAIL` / `BLOCKED`
  - Fill `Actual Result`
  - Attach `Evidence` (screenshot, API response, console/network capture)
- Do not proceed to later phases unless all P0/P1 cases pass.

---

## Environment Pre-Check

- Backend and frontend are running.
- Required env vars set in backend:
  - `COCOART_API_KEY`
  - `COCOART_WEBHOOK_SECRET`
  - `APP_BASE_URL`
  - `PAYMENT_PROVIDER=cocoart`
  - `PAYMENT_HOLD_MINUTES=10` (or your chosen value)
- If testing AI features (Phase 3–5), configure one:
  - **Anthropic**
    - `AI_PROVIDER=anthropic`
    - `ANTHROPIC_API_KEY=...`
  - **Local Llama**
    - `AI_PROVIDER=local-llama`
    - `LOCAL_LLM_ENDPOINT=...` (defaults to `http://localhost:11434/api/generate`)
    - `LOCAL_LLM_MODEL=...` (example: `llama3`)
- If testing weekly summary email (Phase 3):
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL`
- At least 2 tenant courts exist for isolation tests.
- At least 2 admin/staff accounts per same court for realtime sync test.

---

## Test Case Template

Copy this block for each run:

```text
Test ID:
Priority:
Area:
Status: PASS / FAIL / BLOCKED
Tester:
Date:
Steps Executed:
Expected Result:
Actual Result:
Evidence:
Notes:
```

---

## P0 - Must Pass Before Merge/Deploy

### RT-001 - Queue realtime sync (same tenant)
- Priority: P0
- Steps:
  1. Open Queue page in Browser A and Browser B using same court admin/staff accounts.
  2. Add/update/delete a queue entry in Browser A.
  3. Observe Browser B without manual refresh.
- Expected:
  - Browser B updates within a few seconds.
  - No full app crash; data matches Browser A state.
- Actual Result:
- Evidence:

### RT-002 - Billing tab realtime sync (same tenant)
- Priority: P0
- Steps:
  1. Open Billing page in Browser A and Browser B for same court.
  2. Add item to tab in Browser A.
  3. Mark tab paid/unpaid and adjust items.
- Expected:
  - Browser B reflects tab updates and paid/unpaid changes live.
- Actual Result:
- Evidence:

### RT-003 - Tenant isolation for websocket events
- Priority: P0
- Steps:
  1. Log in Court A admin in Browser A.
  2. Log in Court B admin in Browser B.
  3. Trigger queue/billing/reservation mutations in Court A.
- Expected:
  - Court B receives no Court A updates.
- Actual Result:
- Evidence:

### PAY-001 - Payment redirect path correctness
- Priority: P0
- Steps:
  1. Create reservation and trigger approve-payment flow.
  2. Complete payment provider flow until redirect.
- Expected:
  - Redirect lands on `/book/[slug]/status/[publicRef]`.
  - Status page loads reservation data successfully.
- Actual Result:
- Evidence:

### PAY-002 - Valid payment webhook confirms reservation
- Priority: P0
- Steps:
  1. Create payable reservation.
  2. Send valid webhook payload (`PAID` or `SETTLED`) with correct webhook secret.
  3. Reload reservation status/admin reservation list.
- Expected:
  - Reservation transitions to `confirmed`.
  - `paymentStatus` becomes `paid`.
  - Billing reservation tab is created/updated correctly.
- Actual Result:
- Evidence:

### PAY-003 - Webhook idempotency (duplicate event)
- Priority: P0
- Steps:
  1. Re-send exact same webhook event ID used in PAY-002.
- Expected:
  - API returns dedupe behavior (no duplicate processing).
  - No duplicate payout transfer/event side effects.
- Actual Result:
- Evidence:

### PAY-004 - Hold expiry auto-release (cron path)
- Priority: P0
- Steps:
  1. Create reservation in awaiting payment state.
  2. Do not pay.
  3. Wait until `paymentExpiresAt` + cron interval.
- Expected:
  - Reservation transitions to `expired`.
  - Slot becomes available again.
  - No manual status endpoint visit required to trigger expiry.
- Actual Result:
- Evidence:

### PAY-005 - Invalid webhook signature rejection
- Priority: P0
- Steps:
  1. Send webhook with wrong/missing `x-cocoart-webhook-secret`.
- Expected:
  - Request rejected (`401 Unauthorized`).
  - No reservation/payment state mutation occurs.
- Actual Result:
- Evidence:

### STM-001 - Invalid transition returns 409
- Priority: P0
- Steps:
  1. Attempt illegal transitions (example: expire already paid reservation via webhook).
  2. Attempt to cancel from non-cancellable state (e.g. completed).
- Expected:
  - API rejects with `409` and clear transition error.
  - Existing valid state remains unchanged.
- Actual Result:
- Evidence:

---

## P1 - Strongly Recommended Before Deploy

### SUB-001 - Subscription webhook activation
- Priority: P1
- Steps:
  1. Send paid subscription webhook payload with `metadata.type=subscription` and `metadata.courtId`.
- Expected:
  - Court subscription status updates to `active`.
  - `subscription.nextBilling` is set.
- Actual Result:
- Evidence:

### RES-001 - Payment cancellation guardrails
- Priority: P1
- Steps:
  1. Cancel payment from allowed states (`pending_admin` / `approved_waiting_payment`).
  2. Try cancelling from invalid states (`confirmed`, `completed`).
- Expected:
  - Allowed state transitions succeed.
  - Invalid attempts return `409`.
- Actual Result:
- Evidence:

### RT-004 - Socket disconnect fallback behavior
- Priority: P1
- Steps:
  1. Simulate network drop or temporarily stop backend socket.
  2. Verify pages still function via manual refresh and API fetch.
- Expected:
  - No fatal UI lock-up.
  - Core admin actions still usable.
- Actual Result:
- Evidence:

---

## Phase 3 (Weekly Summary Email) - P1/P2 Coverage

### WS-001 - Weekly summary toggle persists
- Priority: P1
- Steps:
  1. Go to Admin → Settings.
  2. Toggle “Weekly Summary Email” OFF and save.
  3. Refresh page and verify it remains OFF.
- Expected:
  - Toggle persists and reflects backend state.
- Actual Result:
- Evidence:

### WS-002 - Weekly summary sends to correct recipient
- Priority: P2
- Steps:
  1. Ensure court has a valid email in `contact.email` or `adminEmail`.
  2. Trigger cron run manually (or temporarily adjust schedule in dev).
- Expected:
  - Email arrives at the expected recipient.
  - Includes week period and quick stats.
- Actual Result:
- Evidence:

### WS-003 - Weekly summary AI fallback behavior
- Priority: P2
- Steps:
  1. Disable AI provider (unset Anthropic key / stop local LLM).
  2. Trigger weekly summary send.
- Expected:
  - Email still sends with raw-data fallback narrative (no crash).
- Actual Result:
- Evidence:

---

## Phase 4 (Analytics Ask) - P0/P1 Coverage

### ASK-001 - Analytics ask returns answer + dataUsed
- Priority: P1
- Steps:
  1. Open Admin Dashboard → Ask Analytics.
  2. Ask: “How much did we earn this week?”
- Expected:
  - Response shows an answer.
  - No cross-tenant leakage.
- Actual Result:
- Evidence:

### ASK-002 - Analytics ask rate limit (10/day)
- Priority: P1
- Steps:
  1. Run 10 successful asks for the same court.
  2. Run the 11th ask.
- Expected:
  - 11th attempt returns `429` with a clear limit message.
- Actual Result:
- Evidence:

### ASK-003 - Analytics ask AI unavailable fallback
- Priority: P1
- Steps:
  1. Disable AI provider.
  2. Ask any question.
- Expected:
  - UI shows: “AI unavailable — check the charts above.”
  - Charts remain usable.
- Actual Result:
- Evidence:

---

## Phase 5 (Queue AI Proofread) - P1 Coverage

### QP-001 - Proofread returns verdict/explanation
- Priority: P1
- Steps:
  1. Go to Admin → Queue.
  2. Generate a match.
  3. Click “Check Fairness”.
- Expected:
  - Shows Verdict + explanation.
  - `AI-assisted` if AI is configured; otherwise shows heuristic fallback.
- Actual Result:
- Evidence:

### QP-002 - Proofread tenant isolation
- Priority: P1
- Steps:
  1. Attempt to proofread using player IDs from another court (via API tool).
- Expected:
  - Request is rejected or returns error (no cross-tenant access).
- Actual Result:
- Evidence:

---

## P2 - Optional Regression Coverage

### SEC-001 - Route role boundary checks
- Priority: P2
- Steps:
  1. Use staff account on admin endpoints that should be admin-only.
  2. Verify unauthorized actions are blocked.
- Expected:
  - Proper `403/401` enforcement by role.
- Actual Result:
- Evidence:

### OBS-001 - Basic observability sanity
- Priority: P2
- Steps:
  1. Execute one full booking/payment flow.
  2. Check backend logs for uncaught exceptions.
- Expected:
  - No unhandled errors during successful flow.
- Actual Result:
- Evidence:

---

## Phase 6 (Experimental Messenger) - Optional Checks (future)

### MSG-001 - Webhook signature verification
- Priority: P2
- Steps:
  1. Send webhook with invalid signature.
- Expected:
  - Rejected; no processing.
- Actual Result:
- Evidence:

### MSG-002 - Court opt-in gating
- Priority: P2
- Steps:
  1. Ensure court is not opted-in.
  2. Send a message event.
- Expected:
  - No auto-reply is sent; safe default.
- Actual Result:
- Evidence:

---

## Sign-off Gate

Release recommendation:

- [ ] All P0 cases PASS
- [ ] No open FAIL in P1 (or documented risk accepted)
- [ ] Tenant isolation confirmed
- [ ] Payment happy path + expiry path + invalid signature path confirmed
- [ ] State transition guardrails confirmed (`409` on invalid transitions)
- [ ] Weekly summary toggle + sending validated (if enabled)
- [ ] Analytics Ask: fallback + rate limit validated (if enabled)
- [ ] Queue proofread: verdict/explanation validated (if enabled)

Approver:  
Date:  
Notes:
