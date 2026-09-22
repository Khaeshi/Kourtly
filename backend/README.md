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

Required for production payment flow:

- `Xendit_API_KEY`
- `Xendit_WEBHOOK_SECRET`
- `APP_BASE_URL`
- `MONGODB_URI`

Runtime behavior:

- In development, missing payment env vars emit warnings.
- In production, missing payment env vars throw on startup (fail fast).

## Production Readiness Checklist

- Configure Xendit webhook URL to `POST /api/payments/Xendit/webhook`.
- Set `Xendit_WEBHOOK_SECRET` to match Xendit callback secret.
- Ensure each court has a configured payout recipient code in admin settings.
- Verify public booking flow in sandbox:
  - create reservation
  - admin approve & generate payment
  - complete payment
  - webhook confirms reservation
  - reservation tab reflects online-paid vs balance due
- Verify payout transfer monitoring:
  - admin dashboard recent transfers
  - superadmin dashboard transfer list
  - retry failed transfer path

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
