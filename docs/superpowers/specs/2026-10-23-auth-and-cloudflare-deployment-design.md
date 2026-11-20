# Design Specification: Authentication & Cloudflare Deployment

**Date:** 2026-10-23  
**Status:** Approved  
**Target Domain:** `quan-ly-cong-van.vcrm.vn`  
**Cloudflare Account:** `vulieumang@gmail.com` (`71903de62e5f4b67e36a8f0b273aa806`)  
**Cloudflare D1 Database:** `document-manager-db` (`09132d0d-01f7-4936-b0cd-d989d6c7ad0a`)

---

## 1. Overview & Objectives

1. **Authentication Subsystem**:
   - Provide a secure, elegant, enterprise-grade login interface for the Document & Contract Management system.
   - Restrict access to authorized users: Single administrator account (`admin` / `admin123`) with full administrative privileges.
   - Support token-based session management (`localStorage` persistence, automatic expiration, header injection `Authorization: Bearer <token>`).
   - Include a user profile indicator and 1-click Logout action in the application Header.
   - Include a 1-click Admin quick-fill button on the login screen for testing convenience.

2. **Cloudflare Deployment**:
   - Deploy the unified Hono + React Vite application onto Cloudflare Workers with Static Assets.
   - Map production traffic directly to custom domain `quan-ly-cong-van.vcrm.vn` via Cloudflare DNS / Workers Routes.
   - Implement dual-driver data persistence:
     - **Local environment (`npm run dev`)**: Reads/writes local JSON files in `data/*.json`.
     - **Cloudflare Worker environment (Production)**: Bundles seed data (73 contracts, 17 documents, 27 partners, categories) in memory on boot and persists state changes into Cloudflare D1 Database (`document-manager-db`).

---

## 2. Authentication System Architecture

### 2.1 Backend API Endpoints (Hono Router: `src/server/routes/auth.ts`)
* `POST /api/auth/login`:
  - Request body: `{ username: string, password: string }`
  - Validates credentials against administrative account (`admin` / `admin123`).
  - Returns `200 OK` on success with payload:
    ```json
    {
      "token": "sgii_adm_token_<timestamp>_<hash>",
      "user": {
        "id": "admin",
        "username": "admin",
        "role": "admin",
        "name": "Quản trị viên Hệ thống",
        "email": "admin@sgii.vn"
      }
    }
    ```
  - Returns `401 Unauthorized` with Vietnamese error message on failure.
* `GET /api/auth/me`:
  - Validates `Authorization: Bearer <token>` header.
  - Returns user profile if valid; `401 Unauthorized` if missing/invalid.
* `POST /api/auth/logout`:
  - Revokes active token session and returns `{ success: true }`.

### 2.2 API Auth Middleware
* Protects all routes under `/api/*` except:
  - `/api/auth/login`
  - `/api/health`
  - Public static assets

### 2.3 Frontend Authentication (`src/client/src/context/AuthContext.tsx` & `LoginView.tsx`)
* **State Management**:
  - `user`: Authenticated user object or `null`.
  - `token`: Stored in `localStorage` under key `sgii_auth_token`.
  - `isAuthenticated`: Boolean derived from active session.
  - `login(username, password)`: Async function calling API and updating state.
  - `logout()`: Clears storage, invalidates session, redirects to login view.
* **API Service (`src/client/src/services/api.ts`)**:
  - Intercepts outgoing requests to attach `Authorization: Bearer <token>`.
  - On `401 Unauthorized`, clears local storage and triggers re-authentication.
* **UI Component (`LoginView.tsx`)**:
  - Fullscreen dark/light adaptive layout with glassmorphism container.
  - Corporate branding: "CÔNG TY CỔ PHẦN SAMBO GOLD", "HỆ THỐNG QUẢN LÝ CÔNG VĂN & HỢP ĐỒNG".
  - Clean inputs for Username and Password with show/hide password toggle.
  - "Ghi nhớ đăng nhập" checkbox.
  - "Đăng nhập nhanh Admin (1-Click)" button.
  - Error badge on failed attempts.
* **Header Integration (`Header.tsx`)**:
  - Displays Administrator badge (e.g. `Quản trị viên` with shield icon).
  - "Đăng xuất" button with confirmation or instant execution.

---

## 3. Cloudflare Deployment Architecture

### 3.1 Wrangler Configuration (`wrangler.jsonc`)
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "quan-ly-cong-van",
  "main": "src/server/index.ts",
  "compatibility_date": "2024-12-30",
  "compatibility_flags": ["nodejs_compat"],
  "account_id": "71903de62e5f4b67e36a8f0b273aa806",
  "assets": {
    "directory": "dist/client",
    "binding": "ASSETS"
  },
  "routes": [
    {
      "pattern": "quan-ly-cong-van.vcrm.vn",
      "custom_domain": true
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "document-manager-db",
      "database_id": "09132d0d-01f7-4936-b0cd-d989d6c7ad0a"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "document-manager-files"
    }
  ]
}
```

### 3.2 Dual-Driver Persistence (`src/server/db/persistence.ts` & `store.ts`)
* If running in Node.js environment (`process.versions.node` and writable filesystem):
  - Uses `data/*.json` files.
* If running in Cloudflare Worker environment:
  - If `fs` throws or is unsupported, silently falls back to bundled in-memory seed data + D1 database binding (`c.env.DB`).
  - Creates necessary tables in D1 on startup if not present (`kv_store` table or entity tables).

---

## 4. Verification & Testing Plan
1. **Unit & Integration Tests**:
   - Add test suite `tests/auth.test.ts` to test login, me, and logout routes, invalid credentials, and token authorization.
   - Run `npm test` to ensure all 43 existing tests + new auth tests pass (100% pass rate).
2. **Build Validation**:
   - Run `npm run build` (`tsc && vite build`) to ensure 0 TypeScript errors.
   - Run `npx wrangler deploy --dry-run` to ensure Worker bundle compiles cleanly without size or dependency errors.
3. **End-to-End Visual Verification**:
   - Take browser screenshots of the new Login page (`/`).
   - Test login with `admin` / `admin123`.
   - Take screenshot of authenticated dashboard with Header user badge and Logout button.
   - Test Logout action.
4. **Cloudflare Deployment**:
   - Execute deployment to Cloudflare with `wrangler deploy`.
   - Verify deployment output and URL `quan-ly-cong-van.vcrm.vn`.
