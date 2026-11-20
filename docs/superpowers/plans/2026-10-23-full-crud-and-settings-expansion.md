# Full CRUD, Partner Management & System Categories Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform DocHub into a complete standalone web management system that fully replaces both Excel files (`He_thong_Quan_ly_Hop_dong.xlsx` and `20261023_SGII_AHR_So_Quan_ly_Cong_van_Den_Di.xlsx`), featuring full CRUD (Create, Read, Update, Delete) for Contracts, Incoming/Outgoing Documents, Partners, and System Reference Categories/Settings, backed by persistent JSON storage.

**Architecture:** Extend Hono server with file-backed persistence for `contracts`, `documents`, `partners`, and `categories`/`settings`. Add RESTful endpoints for CRUD on Partners and Categories. Build React views and modals for Partner management, Category & Settings management (with dedicated menu), and inline/modal editing for Contracts and Documents.

**Tech Stack:** React 18, TypeScript, Hono, Vite, Lucide Icons, Vanilla CSS, Vitest.

**Spec:** Documented in conversation history and Excel workbooks analysis (73 contracts, 27 partners, 14 correspondence documents, 7 category groups, 3 system alert parameters).

## Global Constraints

- **File Deletion Safety:** NEVER use `rm` or `rm -rf`. Always preserve user files and use system trash if cleanup is needed.
- **Port Consistency:** Dev server runs on port `5180`.
- **Data Integrity:** Preserve all 73 contracts, 27 partners, 10 incoming documents, 4 outgoing documents, and all reference categories without data loss.
- **Persistence:** All edits and new creations must be persisted to disk in `data/*.json` files.

## Review Focus

1. Partner duplicate code collision: creating a partner with an existing code must be rejected with a 400 error.
2. Category deletion cascade: deleting a category used by existing contracts or documents must show a confirmation warning.
3. Safe number parsing: currency, exchange rates, and values must gracefully handle formatted strings or commas.
4. Vietnamese text diacritic search: search across partners, categories, contracts, and documents must match with or without accents.
5. Storage location tracking: physical storage locations (`Tủ HC-01 / Kệ 2026`) must be preserved and editable on both contracts and documents.

---

### Task 1: Server Data Persistence & Storage Model

**Files:**
- Create: `src/server/db/persistence.ts`
- Modify: `src/server/db/store.ts`
- Test: `tests/persistence.test.ts`

- [ ] **Step 1: Write failing test for persistence layer**
  Create `tests/persistence.test.ts` testing saving and loading contracts, partners, documents, and categories to/from disk.
- [ ] **Step 2: Run test to confirm failure**
  Run `npx vitest run tests/persistence.test.ts`.
- [ ] **Step 3: Implement persistence layer in `src/server/db/persistence.ts`**
  Ensure directory `data/` is initialized, loading initial seeds if `data/*.json` do not exist, and saving changes upon every mutation (`saveData()`).
- [ ] **Step 4: Update `MemoryStore` in `src/server/db/store.ts`**
  Integrate `persistence` with `MemoryStore` so all create/update/delete operations call `saveData()`.
- [ ] **Step 5: Run tests and verify they pass**
  Run `npx vitest run tests/persistence.test.ts`.
- [ ] **Step 6: Commit**
  `git commit -m "feat(store): implement file-backed persistence for documents, contracts, partners, and categories"`

---

### Task 2: Partners Management REST API (Full CRUD)

**Files:**
- Modify: `src/server/routes/partners.ts`
- Modify: `src/server/db/store.ts`
- Test: `tests/partners.test.ts`

- [ ] **Step 1: Write failing test for Partner CRUD endpoints**
  Create `tests/partners.test.ts` testing `POST /api/partners`, `PATCH /api/partners/:id`, and `DELETE /api/partners/:id`.
- [ ] **Step 2: Run test to confirm failure**
  Run `npx vitest run tests/partners.test.ts`.
- [ ] **Step 3: Add partner CRUD methods in `MemoryStore`**
  Add `createPartner`, `updatePartner`, `deletePartner`, and `togglePartnerLock`.
- [ ] **Step 4: Implement routes in `src/server/routes/partners.ts`**
  Handle `POST /`, `PATCH /:id`, and `DELETE /:id` with validation (duplicate code check).
- [ ] **Step 5: Run tests and verify they pass**
  Run `npx vitest run tests/partners.test.ts`.
- [ ] **Step 6: Commit**
  `git commit -m "feat(api): add full CRUD endpoints for partner management"`

---

### Task 3: Categories & System Settings REST API (Full CRUD)

**Files:**
- Modify: `src/server/routes/categories.ts`
- Modify: `src/server/db/store.ts`
- Test: `tests/categories.test.ts`

- [ ] **Step 1: Write failing test for Category & Settings CRUD endpoints**
  Create `tests/categories.test.ts` testing adding, updating, and deleting items in categories (`doc_types`, `agencies`, `departments`, `personnel`, `contract_types`), and updating alert thresholds.
- [ ] **Step 2: Run test to confirm failure**
  Run `npx vitest run tests/categories.test.ts`.
- [ ] **Step 3: Add category & setting methods in `MemoryStore`**
  Add `getCategories`, `addCategoryItem`, `updateCategoryItem`, `deleteCategoryItem`, and `updateSettings`.
- [ ] **Step 4: Implement routes in `src/server/routes/categories.ts`**
  Handle `POST /api/categories/:type`, `PATCH /api/categories/:type/:index`, `DELETE /api/categories/:type/:index`, and `PATCH /api/categories/settings`.
- [ ] **Step 5: Run tests and verify they pass**
  Run `npx vitest run tests/categories.test.ts`.
- [ ] **Step 6: Commit**
  `git commit -m "feat(api): add CRUD endpoints for reference categories and system alert settings"`

---

### Task 4: Complete Contract & Document Edit Endpoints

**Files:**
- Modify: `src/server/routes/contracts.ts`
- Modify: `src/server/routes/documents.ts`
- Test: `tests/edit_records.test.ts`

- [ ] **Step 1: Write failing test for full record edits**
  Create `tests/edit_records.test.ts` verifying updating all fields of a contract and document.
- [ ] **Step 2: Run test to confirm failure**
  Run `npx vitest run tests/edit_records.test.ts`.
- [ ] **Step 3: Enhance `PATCH /api/contracts/:id` and `PATCH /api/documents/:id`**
  Support updating all fields including directive, handler, completed_date, storage_location, renewal_terms, and values.
- [ ] **Step 4: Run tests and verify they pass**
  Run `npx vitest run tests/edit_records.test.ts`.
- [ ] **Step 5: Commit**
  `git commit -m "feat(api): support full field editing for contracts and correspondence"`

---

### Task 5: Frontend Partner Management (PartnerTableView + PartnerModal)

**Files:**
- Modify: `src/client/src/components/PartnerTableView.tsx`
- Create: `src/client/src/components/PartnerModal.tsx`
- Modify: `src/client/src/services/api.ts`
- Modify: `src/client/src/App.tsx`

- [ ] **Step 1: Add partner CRUD methods in `api.ts`**
  Add `createPartner`, `updatePartner`, `deletePartner`.
- [ ] **Step 2: Create `PartnerModal.tsx`**
  Form with fields: Code (Client ID), Name VN, Name EN, Category, Tax ID, Representative, Contact, Phone, Address, Notes.
- [ ] **Step 3: Update `PartnerTableView.tsx`**
  Add "+ Thêm đối tác" button, Edit button per row, Delete button per row, and Lock/Unlock status toggle.
- [ ] **Step 4: Integrate modal state in `App.tsx`**
  Wire partner creation, editing, and deletion with instant re-fetching.
- [ ] **Step 5: Verify build**
  Run `npm run build`.
- [ ] **Step 6: Commit**
  `git commit -m "feat(ui): add partner create, edit, delete, and lock management in PartnerTableView"`

---

### Task 6: Frontend Category & Settings Management (`CategorySettingsView.tsx`)

**Files:**
- Create: `src/client/src/components/CategorySettingsView.tsx`
- Modify: `src/client/src/components/Header.tsx`
- Modify: `src/client/src/components/Sidebar.tsx`
- Modify: `src/client/src/services/api.ts`
- Modify: `src/client/src/App.tsx`

- [ ] **Step 1: Add category API methods in `api.ts`**
  Add `addCategoryItem`, `updateCategoryItem`, `deleteCategoryItem`, `updateSettings`.
- [ ] **Step 2: Build `CategorySettingsView.tsx`**
  Tabs for:
  - 1. Loại văn bản & Mã loại
  - 2. Cơ quan / Đơn vị gửi nhận
  - 3. Bộ phận & Mã BP
  - 4. Nhân sự & Bộ phận
  - 5. Loại hợp đồng & Hình thức lưu trữ
  - 6. Tham số cảnh báo hạn mức 1 (30d), mức 2 (60d) & đồng tiền báo cáo
  With inline add, edit, and delete capability for each item.
- [ ] **Step 3: Add `⚙️ Danh mục & Thiết lập` to Header & Sidebar**
  Update `Header.tsx` and `Sidebar.tsx` to include the settings view mode.
- [ ] **Step 4: Mount in `App.tsx`**
  Render `CategorySettingsView` when selected.
- [ ] **Step 5: Verify build**
  Run `npm run build`.
- [ ] **Step 6: Commit**
  `git commit -m "feat(ui): add dedicated Category and System Settings management view with full CRUD"`

---

### Task 7: Frontend Edit Modal for Contracts & Documents

**Files:**
- Create: `src/client/src/components/EditRecordModal.tsx`
- Modify: `src/client/src/components/DetailPane.tsx`
- Modify: `src/client/src/App.tsx`

- [ ] **Step 1: Create `EditRecordModal.tsx`**
  Comprehensive edit modal supporting:
  - For Documents: title, original number, category, issuer, department, handler, due date, completed date, directive, storage location, notes.
  - For Contracts: title, original contract number, partner, value, currency, exchange rate, signed date, start date, end date, storage location, renewal terms, notes.
  - Dropdown options dynamically fed from the Category system.
- [ ] **Step 2: Add "Chỉnh sửa" (Edit) button in `DetailPane.tsx`**
  Render next to Delete/Thanh lý buttons to trigger the edit modal.
- [ ] **Step 3: Connect update handling in `App.tsx`**
  Save changes to backend and refresh active item.
- [ ] **Step 4: Verify build**
  Run `npm run build`.
- [ ] **Step 5: Commit**
  `git commit -m "feat(ui): add EditRecordModal and edit triggers in DetailPane for contracts and documents"`

---

### Task 8: End-to-End Verification & Automated Test Suite

**Files:**
- Modify: `tests/api.test.ts`

- [ ] **Step 1: Run complete Vitest suite**
  Run `npm test` and verify all tests pass.
- [ ] **Step 2: Run complete production build**
  Run `npm run build`.
- [ ] **Step 3: Verify dev server API responses with curl**
  Test endpoints: `/api/partners`, `/api/categories`, `/api/contracts`, `/api/documents`, `/api/stats`.
- [ ] **Step 4: Final commit**
  `git commit -m "chore: complete verification of standalone CRUD system for document and contract management"`
