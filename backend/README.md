# Backend

Express + Mongoose backend for badminton operations (users, courts, schedules, reservations, queueing, tabs, analytics, and public booking).

## Tech Stack

- Node.js + Express 5 (ES Modules)
- MongoDB + Mongoose
- Resend (email integration)
- CORS + dotenv

## Scripts

From the `backend` directory:

```bash
npm install
npm run dev
npm test
```

Current script notes:

- `dev` runs `node server.js`
- `test` runs Jest in-band (`node --experimental-vm-modules ...jest --runInBand`)

## Payment Environment (Xendit)

Configure the Xendit master account and callback:

- `XENDIT_SECRET_KEY` — `xnd_development_...` for test mode or `xnd_production_...` for live mode.
- `XENDIT_CALLBACK_TOKEN` — master-account invoice webhook token.
- `XENDIT_WEBHOOK_URL` — full public HTTPS URL ending in `/api/payments/xendit/webhook`; required in production and optional in local development.
- `XENDIT_XENPLATFORM_ENABLED` — rollout flag for court sub-account reservation payments; defaults to off.
- `APP_BASE_URL`
- `MONGODB_URI`

Runtime behavior:

- Xendit mode is derived from the secret-key prefix and an unsupported prefix fails startup validation.
- Production startup requires a valid public HTTPS callback URL without an explicit port.
- Approved court admins use `POST /api/court/me/xendit/setup` to create/link a Managed account and `POST /api/court/me/xendit/refresh` to refresh its status and configure its invoice callback.
- Sub-account callback tokens are stored only as SHA-256 hashes.
- Reservation invoices use the court's sub-account `for-user-id` header only when XenPlatform is enabled and the court account status and invoice webhook are ready.
- The readiness allowlist currently accepts `REGISTERED` only in development mode and is empty in production until live status values are confirmed. Production reservation payments therefore fail closed.
- Subscription invoices omit `for-user-id` and stay on the master account.
- Existing payout recipient settings are unchanged by this initial XenPlatform rollout.

## Production Readiness Checklist

- Confirm live Managed sub-account status values with Xendit before adding them to the production readiness allowlist.
- Configure the master-account callback token and public `XENDIT_WEBHOOK_URL`.
- Keep `XENDIT_XENPLATFORM_ENABLED=false` until the account setup and invoice routing rollout is approved.
- Complete Xendit onboarding and verify invoice routing in the appropriate environment before enabling reservation payments.

## Folder Structure

```text
backend/
  server.js                              # App bootstrap, middleware, route mounting
  package.json
  railway.json

  src/
    controllers/
      userController.js

    middleware/
      errorMiddleware.js                 # Global error handling
      tenantMiddleware.js                # Tenant/court scoping support

    models/
      User.js
      Court.js
      Player.js
      Reservation.js
      ReservationTab.js
      Tab.js
      Item.js
      Match.js
      ScheduleRule.js
      ScheduleBlock.js

    routes/
      analyticsRoutes.js
      courtRoutes.js
      itemRoutes.js
      playerRoutes.js
      publicRoutes.js
      queueRoutes.js
      reservationRoutes.js
      reservationtabRoutes.js
      scheduleRoutes.js
      superadminRoutes.js
      tabRoutes.js
      userRoutes.js

    emails/
      confirmationEmail.js               # Booking/reservation email templates/logic

    utils/
      scheduleUtils.js                   # Schedule calculation helpers
```

## Architecture Notes

- The codebase follows a route-first API organization with domain-specific route files and centralized models.
- Middleware separation is clean (`tenant` and `error`), which helps isolate behavior during tests.
- `scheduleUtils.js` is a strong candidate for deterministic unit tests.
- `publicRoutes.js` and reservation/schedule routes likely contain your highest business-risk logic and should be prioritized.

## Jest Internal Test Readiness

Recommended sequence for comprehensive internal coverage:

1. **Unit tests**
   - `src/utils/scheduleUtils.js`
   - `src/emails/confirmationEmail.js` (with mocked email provider)
2. **Model tests**
   - Validation and schema behavior for `User`, `Court`, `Reservation`, `ScheduleRule`, `ScheduleBlock`
3. **Route integration tests**
   - `publicRoutes`, `reservationRoutes`, `scheduleRoutes`, `queueRoutes`
   - Auth and tenant behavior via middleware-aware request tests
4. **Error-path tests**
   - Verify consistent API error output through `errorMiddleware.js`

### Suggested test folders

```text
src/
  __tests__/
    unit/
    models/
    routes/
    middleware/
```

## Notes for Next Step

- Add Jest + Supertest + Mongo test strategy (in-memory MongoDB or dedicated test database).
- Wire `npm test` to run Jest and add at least one smoke test per critical route group.
- After setup, coverage targets can be enforced progressively (for example: start at 60%, then raise).
