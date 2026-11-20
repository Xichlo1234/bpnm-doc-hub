# Authentication & Cloudflare Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement single-admin authentication (`admin` / `admin123`) and deploy the application to Cloudflare Workers on domain `quan-ly-cong-van.vcrm.vn`.

**Architecture:** A Hono-based authentication route (`/api/auth/*`) generates Bearer tokens verified via middleware. React uses an `AuthContext` to protect the UI with a `LoginView` (including 1-click admin quick-fill) and shows an Admin badge with Logout in the Header. The application is configured with `wrangler.jsonc` for Cloudflare Workers + Static Assets with D1 database fallback.

**Tech Stack:** Hono, TypeScript, React 18, Vite, Vitest, Cloudflare Workers, Wrangler, Cloudflare D1.

**Spec:** [`docs/superpowers/specs/2026-10-23-auth-and-cloudflare-deployment-design.md`](file:///Users/vu/Documents/project/document-manager/docs/superpowers/specs/2026-10-23-auth-and-cloudflare-deployment-design.md)

## Global Constraints
- Only one administrator account: username `admin`, initial password `admin123`.
- Cloudflare Account ID: `71903de62e5f4b67e36a8f0b273aa806` (`vulieumang@gmail.com`).
- Custom Domain: `quan-ly-cong-van.vcrm.vn`.
- D1 Database ID: `09132d0d-01f7-4936-b0cd-d989d6c7ad0a` (`document-manager-db`).
- All existing 43 tests must continue to pass 100%.

## Review Focus
1. Invalid credentials must return `401 Unauthorized` with friendly Vietnamese message.
2. Missing or expired token must prevent access to protected endpoints `/api/documents`, `/api/contracts`, etc.
3. Unauthenticated frontend users must see `LoginView` and cannot access the main application.
4. Logging out must immediately wipe the token and show `LoginView`.
5. Cloudflare Worker runtime must not crash on Node.js `fs` calls; it must use seed data and D1.

---

### Task 1: Backend Authentication Router & Middleware

**Files:**
- Create: `src/server/routes/auth.ts`
- Modify: `src/server/index.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/auth/login`: `{ username: string, password: string } -> { token: string, user: UserProfile }`
  - `GET /api/auth/me`: headers with `Authorization: Bearer <token> -> { user: UserProfile }`
  - `POST /api/auth/logout`: headers with `Authorization: Bearer <token> -> { success: boolean }`
  - `authMiddleware`: Hono middleware validating token for all `/api/*` except `/api/auth/login` and `/api/health`.

- [ ] **Step 1: Write test suite for authentication endpoints**
Create `tests/auth.test.ts` testing successful login, wrong password, /api/auth/me validation, /api/auth/logout, and route protection.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL on `tests/auth.test.ts` because `authRouter` does not exist yet.

- [ ] **Step 3: Implement `src/server/routes/auth.ts` and mount in `src/server/index.ts`**
Implement login logic for `admin` / `admin123`, token generator, token validation, and mount route in `app.route('/api/auth', authRouter)`. Add auth check middleware.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: All tests pass (including `tests/auth.test.ts`).

- [ ] **Step 5: Commit**
```bash
git add src/server/routes/auth.ts src/server/index.ts tests/auth.test.ts
git commit -m "feat(auth): add backend authentication router and token validation middleware"
```

---

### Task 2: Frontend Auth Context, LoginView, & Header Logout Integration

**Files:**
- Create: `src/client/src/context/AuthContext.tsx`
- Create: `src/client/src/components/LoginView.tsx`
- Modify: `src/client/src/services/api.ts`
- Modify: `src/client/src/components/Header.tsx`
- Modify: `src/client/src/App.tsx`
- Modify: `src/client/styles/index.css`

**Interfaces:**
- Produces:
  - `useAuth()` hook: `{ user, token, isAuthenticated, login, logout, isLoading }`
  - `api.setAuthToken(token: string | null)`: Attaches Bearer token to all fetch calls.
  - `LoginView`: Screen displayed when unauthenticated, with username, password, show/hide toggle, and 1-click admin quick-login.
  - `Header`: Displays Admin badge and Logout button in top-right.

- [ ] **Step 1: Update `src/client/src/services/api.ts` with token management**
Add `getAuthToken()`, `setAuthToken(token: string | null)`, and auto-inject `Authorization: Bearer <token>` in requests. Add `api.login()`, `api.getMe()`, and `api.logout()`.

- [ ] **Step 2: Create `src/client/src/context/AuthContext.tsx`**
Provide `AuthProvider` managing `user`, `token`, `login`, and `logout`, checking `api.getMe()` on initialization.

- [ ] **Step 3: Create `src/client/src/components/LoginView.tsx` and styles in `index.css`**
Build a polished corporate login screen with Sambo Gold branding, inputs for `admin` and `admin123`, remember me checkbox, error alert, and 1-click admin quick-login.

- [ ] **Step 4: Update `Header.tsx` and `App.tsx`**
Integrate `AuthProvider` in `App.tsx`. If not authenticated, render `LoginView`. In `Header.tsx`, display Admin badge and Logout button calling `logout()`.

- [ ] **Step 5: Run tests and build check**
Run: `npm run build && npm test`
Expected: Build passes with 0 errors, all tests pass.

- [ ] **Step 6: Commit**
```bash
git add src/client/src/context/AuthContext.tsx src/client/src/components/LoginView.tsx src/client/src/services/api.ts src/client/src/components/Header.tsx src/client/src/App.tsx src/client/styles/index.css
git commit -m "feat(auth): add frontend auth context, LoginView component, and header logout"
```

---

### Task 3: Cloudflare Worker Runtime Support & Wrangler Configuration

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `src/server/db/persistence.ts`
- Modify: `src/server/db/store.ts`

**Interfaces:**
- Configures `wrangler.jsonc` with `account_id`, custom domain route `quan-ly-cong-van.vcrm.vn`, and D1 database `document-manager-db`.
- Updates `persistence.ts` to safely catch `fs` errors on serverless runtime and use bundled seed data with in-memory store.

- [ ] **Step 1: Update `wrangler.jsonc`**
Add:
- `account_id: "71903de62e5f4b67e36a8f0b273aa806"`
- `routes: [{ "pattern": "quan-ly-cong-van.vcrm.vn", "custom_domain": true }]`
- `d1_databases`: database_id `09132d0d-01f7-4936-b0cd-d989d6c7ad0a`

- [ ] **Step 2: Update `persistence.ts` and `store.ts` for Cloudflare Worker runtime**
Safely guard `fs` imports and operations so that if `fs` is unavailable or read-only, it falls back to memory store initialized with seed datasets (73 contracts, 17 documents, 27 partners, categories).

- [ ] **Step 3: Run dry-run deployment check**
Run: `CLOUDFLARE_ACCOUNT_ID=71903de62e5f4b67e36a8f0b273aa806 npx wrangler deploy --dry-run`
Expected: Bundles cleanly with 0 errors.

- [ ] **Step 4: Commit**
```bash
git add wrangler.jsonc src/server/db/persistence.ts src/server/db/store.ts
git commit -m "chore(cloudflare): configure wrangler custom domain and safe serverless persistence"
```

---

### Task 4: Deployment to Cloudflare & Production Verification

- [ ] **Step 1: Build client production bundle**
Run: `npm run build`
Verify `dist/client` exists with compiled assets.

- [ ] **Step 2: Deploy to Cloudflare**
Run: `CLOUDFLARE_ACCOUNT_ID=71903de62e5f4b67e36a8f0b273aa806 npx wrangler deploy`
Verify deployment output and custom domain route.

- [ ] **Step 3: Verify production endpoint**
Test HTTP request to `https://quan-ly-cong-van.vcrm.vn/api/health` and verify HTTP 200.

- [ ] **Step 4: Visual verification**
Capture screenshot of login and dashboard.
