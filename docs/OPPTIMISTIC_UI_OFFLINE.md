## **WAAS Optimistic UI & Offline proof webservice v3.7.8**

**Offline-first readiness (current repo)**

Based on your current `frontend/public/sw.js`, `frontend/src/app/components/PWAInit.tsx`, and `frontend/src/app/offline/page.tsx`:

- **Website still opens when internet is slow or gone**: **Mostly yes**
  - You have a service worker that caches an **app shell** (`/`, `/offline`, manifest) and does **navigation fallback** to cache/offline page.
  - Static assets (CSS/JS/fonts/images) are **cache-first**, so repeat visits work well offline.
- **User sees connection status**: **Yes (court admin only)**
  - `PWAInit` shows the offline / pending-sync **pill only on `/admin/*`**. Public and super-admin routes do not show it (see changelog below).
- **Actions/changes are saved locally**: **Yes for court-admin Players / Items / Billing; no for public booking**
  - IndexedDB **outbox** + **`req()`** in `frontend/src/lib/api.ts` queue writes when offline for those admin APIs.
  - In booking (`(public)/book/[slug]/page.tsx`) you still block submit when offline.
- **Changes sync automatically once internet returns**: **Yes (court-admin queued writes)**
  - `PWAInit` triggers `flushQueuedActions` when back online and on a 15s interval while pending work exists.
- **Notifications or retry handling happen in the background**: **Partially**
  - Outbox retries from the **client** (not Background Sync API). Service worker still does not replay the outbox by itself.

The sections below describe **court-admin** optimistic/offline behavior that was added on top of that baseline.

### **Implemented: optimistic + offline-resilient Players, Items, Billing (and they stay in sync)**

You can now keep operating on these three pages **without wifi**:

- **Players**: add / edit / delete works offline (queued + optimistic UI)
- **Items**: add / edit / hide/show / delete works offline (queued + optimistic UI)
- **Billing**: open tab / add item / remove item / mark unpaid / pay / close tab / split item works offline (queued + optimistic UI)

And crucially: **changes propagate across pages (and even other tabs)** while offline.

## **What I added**

- **IndexedDB local cache** (so GET data still exists offline):
  - `frontend/src/lib/localCache.ts` stores `players`, `items`, `openTabs`
- **IndexedDB outbox** (queued writes when offline / flaky network):
  - `frontend/src/lib/offlineOutbox.ts`
- **Local cross-page event bus** (BroadcastChannel + fallback):
  - `frontend/src/lib/localEvents.ts`
- **Auto-sync + background retry + UI indicator**:
  - `frontend/src/app/components/PWAInit.tsx`
  - Shows pending count, flushes on reconnect, retries every 15s, broadcasts `data:sync` after flush; **pill UI only under `/admin/*`** (see changelog).

## **What I changed**

- **Players page** (`frontend/src/app/(admin)/admin/players/page.tsx`)
  - Loads from cache when offline
  - On queued actions: updates UI immediately + updates cache + emits `players:updated`
- **Items page** (`frontend/src/app/(admin)/admin/items/page.tsx`)
  - Same pattern as Players, emits `items:updated`
- **Billing page** (`frontend/src/app/(admin)/admin/billing/page.tsx`)
  - Loads Players/Items/OpenTabs from cache when offline
  - Listens to `players:updated`, `items:updated`, `billing:`*, `data:sync`
  - Optimistic updates also update cached `openTabs` so the UI keeps moving offline

---

## **Changelog — court-admin PWA scope, IndexedDB, public logos, super-admin**

### **PWA / offline UI scope (court admin vs super-admin)**

- **`PWAInit`** (`frontend/src/app/components/PWAInit.tsx`): the **bottom pill** (“Offline mode…”, pending sync, syncing…) is shown **only when the URL is under `/admin/*`** (each court’s admin dashboard). **Super-admin** (`/superadmin`, `/courts`, `/users`, etc.) and the **public** site do **not** show that pill.
- **Service worker** registration and **outbox flush** (reconnect + 15s retry) still run from the root **`Providers`** so queued court-admin writes can finish even after navigation; the **super-admin experience is not “offline-first product”** the way court ops is.

### **IndexedDB: one database, `kv` + `outbox`**

- Both **`frontend/src/lib/localCache.ts`** and **`frontend/src/lib/offlineOutbox.ts`** use the same DB name **`playkou`** and version **`3`**.
- **`onupgradeneeded`** in each module ensures **both** object stores exist: **`kv`** (entity cache: `players`, `items`, `openTabs`) and **`outbox`** (queued writes). This avoids a race where only `kv` existed and the outbox could never open.

### **Mobile / layout**

- **`frontend/src/hooks/useIsMobile.ts`**: `matchMedia('(max-width: 639px)')` + `change` listener for reliable toaster placement (replaces a one-shot `window.innerWidth` check) in **`AdminLayoutClient`** and **`SuperAdminLayoutClient`**.
- Super-admin **Dashboard**, **Courts**, and **Users** pages got small responsive tweaks (wrapping filters/rows, payout rows, directory-style cards where needed).

### **Public court logos**

- Court admins already upload a logo in **Admin → Settings**; it is stored as **`Court.logoUrl`** and returned by **`GET /api/public/courts`** and **`GET /api/public/courts/:slug`**.
- **`frontend/src/app/(public)/usercourts/page.tsx`** now **renders `logoUrl`** on each court card (with a letter fallback) so the directory matches booking and API data.

### **Super-admin: end / “delete” a court subscription**

- **Backend**: `DELETE /api/superadmin/courts/:id/subscription` in `backend/src/routes/superadminRoutes.js` — sets subscription to **expired**, clears billing-related fields, sets **`isPublic: false`** (court document is **not** deleted; **Reactivate** via existing PATCH still applies).
- **Frontend**: **“End subscription”** on the super-admin **Dashboard** courts table and on the **Courts** page expanded **Subscription actions** (proxied as `DELETE` through `frontend/src/app/api/proxy/[...path]/route.ts`).

### **Cash tabs + line cost snapshot (offline cache)**

- **Cash tabs** (`tabType: 'cash'`, optional `cashLabel`, `player: null`) appear in **`openTabs`** the same way as player tabs. When you open a cash tab offline, the optimistic row should include `tabType`, `cashLabel`, and `player: null` (or omitted) so **Billing** renders consistently after reload from IndexedDB.
- **Tab line items** include **`costEach`** (snapshot of catalog unit cost at sale time). Optimistic **add-to-tab** updates should set `costEach` from the catalog item’s **`costPrice`** when known, so cached `openTabs` stay aligned with server analytics and profit views after sync.
