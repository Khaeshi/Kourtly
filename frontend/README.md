# Frontend

Next.js (App Router) frontend for the badminton booking and administration platform.

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- NextAuth (auth flow and session handling)
- Tailwind CSS 4
- ESLint 9

## Scripts

From the `frontend` directory:

```bash
npm install
npm run dev
npm run build
npm run start
npm run lint
```

## Folder Structure

```text
frontend/
  auth.ts                                # NextAuth configuration
  middleware.ts                          # Route protection / request middleware
  next.config.ts
  eslint.config.mjs
  postcss.config.mjs
  tsconfig.json
  package.json
  public/                                # Static assets

  src/
    app/
      layout.tsx                         # Root app layout
      page.tsx                           # Landing/home page
      styles/globals.css                 # Global styles

      (auth)/
        auth/signin/page.tsx             # Sign-in page

      (public)/
        register-court/page.tsx          # Public court registration flow
        book/[slug]/page.tsx             # Public booking page

      (admin)/
        layout.tsx
        onboarding/layout.tsx
        onboarding/page.tsx
        admin/
          page.tsx
          [...path]/page.tsx             # Catch-all admin routing
          billing/page.tsx
          items/page.tsx
          players/page.tsx
          queue/page.tsx
          reservation/page.tsx
          schedule/page.tsx
          settings/page.tsx

      (superadmin)/
        layout.tsx
        superadmin/page.tsx
        courts/page.tsx
        users/page.tsx

      api/
        auth/[...nextauth]/route.ts      # NextAuth API route
        proxy/[...path]/route.ts         # Backend proxy route
        debug/route.ts
        public/
          courts/route.ts
          register-court/route.ts

      components/
        Providers.tsx
        ui/Button.tsx
        admin/
          AdminLayoutClient.tsx
          AdminSidebar.tsx
        superadmin/
          SuperAdminLayoutClient.tsx

    lib/
      api.ts                             # Client-side API helpers
      config.ts                          # Shared app configuration

    types/
      next-auth.d.ts                     # NextAuth type augmentation
```

## Architecture Notes

- Route groups are cleanly separated by role (`(public)`, `(auth)`, `(admin)`, `(superadmin)`), which is good for permission-focused testing.
- API routes are split between auth, proxy, and public handlers, giving clear seams for unit and integration tests.
- Shared UI and layout client components are grouped by domain under `components/admin` and `components/superadmin`.

## Jest Internal Test Readiness

The project is in a good shape to introduce Jest tests with this phased approach:

1. **Utilities first**: test `src/lib/api.ts` and `src/lib/config.ts` as pure units.
2. **API route handlers**: add request/response tests for `src/app/api/**/route.ts`.
3. **Role-based pages/components**: cover admin and superadmin layout behavior with mocked auth/session.
4. **Critical flows**: add tests for booking (`(public)/book/[slug]`) and schedule/reservation admin pages.

### Suggested test folders

```text
src/
  __tests__/
    lib/
    api/
    components/
    pages/
```

## Notes for Next Step

- Jest is not configured yet in `package.json` scripts, so setup is still needed (`jest`, `@testing-library/react`, config, and environment setup).
- Once you are ready, I can scaffold the full frontend Jest setup and initial smoke tests.
