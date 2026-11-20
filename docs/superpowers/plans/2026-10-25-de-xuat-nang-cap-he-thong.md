# Kế hoạch Triển khai Nâng cấp Hệ thống Quản lý Tài liệu (SGII Document Manager)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai toàn diện 5 phân hệ theo đề xuất: Phân quyền & Quản lý User (RBAC + Audit Log), Bộ lọc bảng Hợp đồng nâng cao, Xuất/Nhập dữ liệu Excel (.xlsx + Preview), Hoàn thiện Tiếng Anh & Bổ sung Tiếng Khmer (i18n), Hỗ trợ Đa tiền tệ (Multi-currency).

**Architecture:** Mở rộng backend Hono (routes, store, persistence, auth middleware kiểm tra quyền Admin/User, audit log) và giao diện React/Vite (RBAC UI, i18n vi/en/km với font Noto Sans Khmer, filter bar cho Hợp đồng, modal Excel Export/Import đa năng, selector tiền tệ & format chuẩn ISO).

**Tech Stack:** Hono (Node/Cloudflare), React 18, TypeScript, Lucide Icons, xlsx / SheetJS (cho import/export file Excel định dạng .xlsx), Vitest.

**Spec:** [De_xuat_nang_cap_he_thong1.docx](../../reference/De_xuat_nang_cap_he_thong1.docx)

## Global Constraints
- Bảo mật xóa dữ liệu: Không dùng rm/rm -rf, luôn dùng lệnh `trash` cho thao tác file nếu cần.
- RBAC: Role `admin` được toàn quyền thêm, sửa, xóa, quản lý user, import excel. Role `user` chỉ được xem danh sách, xem chi tiết, tải xuống tài liệu và xuất excel; không được thêm/sửa/xóa hay import.
- Tiền tệ: Hỗ trợ mã chuẩn ISO 4217 (USD, KHR, VND, AUD, EUR, THB, CNY, SGD, JPY...). Định dạng hiển thị đúng chữ số thập phân (USD 2 số lẻ; VND/KHR 0 số lẻ).
- Ngôn ngữ: Hỗ trợ 3 ngôn ngữ: Tiếng Việt (`vi`), Tiếng Anh (`en`), Tiếng Khmer (`km`). Rà soát chuyển ngữ 100% không để sót hardcode tiếng Việt khi chọn `en` hoặc `km`.
- Excel: Sử dụng định dạng `.xlsx`, có cột `ID` để định danh khi import/cập nhật, màn hình preview trước khi lưu, kiểm tra ràng buộc dữ liệu.

## Review Focus
1. Người dùng role `user` cố tình gọi API tạo/sửa/xóa (POST/PUT/PATCH/DELETE) phải bị server chặn với HTTP 403 Forbidden.
2. Bộ lọc Hợp đồng kết hợp nhiều tiêu chí (từ khóa, đối tác, loại HĐ, trạng thái, bộ phận, tiền tệ, khoảng giá trị) hoạt động mượt mà và nút Xóa bộ lọc khôi phục toàn bộ danh sách.
3. Import file Excel: Dòng có ID trùng thì cập nhật, không có ID thì tạo mới, phát hiện lỗi dữ liệu và hiển thị bảng preview trước khi bấm xác nhận ghi dữ liệu.
4. Chuyển đổi ngôn ngữ sang `en` và `km` hiển thị đầy đủ tiêu đề, nhãn cột, trạng thái, modal, thông báo lỗi.
5. Quản lý danh mục tiền tệ và định dạng số tiền đúng theo từng loại tiền khi hiển thị và tính toán thống kê riêng biệt.

---

### Task 1: Thiết lập thư viện Excel (`xlsx`) & Cấu trúc Dữ liệu RBAC / Multi-currency / Audit Log ở Backend

**Files:**
- Modify: `package.json`
- Modify: `src/server/types.ts`
- Modify: `src/server/db/persistence.ts`
- Modify: `src/server/db/store.ts`
- Test: `tests/store_upgrades.test.ts`

**Interfaces:**
- Consumes: Cấu trúc `PersistedDataset` hiện tại.
- Produces: 
  - `UserAccount { id, username, passwordHash, name, email, role: 'admin' | 'user', status: 'active' | 'locked', created_at, updated_at }`
  - `AuditLogRecord { id, user_id, username, action, entity_type, entity_id, details, timestamp }`
  - `CurrencyItem { code: string, name: string, symbol: string, decimals: number, is_default?: boolean, active: boolean }`
  - `store.getUsers()`, `store.createUser()`, `store.updateUser()`, `store.recordAuditLog()`, `store.getAuditLogs()`, `store.getCurrencies()`, `store.updateCurrencies()`

- [ ] **Step 1: Cài đặt thư viện `xlsx` vào `package.json`**
- [ ] **Step 2: Viết test failing cho RBAC User, Audit Log, Currency Store trong `tests/store_upgrades.test.ts`**
- [ ] **Step 3: Cập nhật `src/server/types.ts`, `src/server/db/persistence.ts`, `src/server/db/store.ts` để lưu trữ user, logs, currencies**
- [ ] **Step 4: Chạy test kiểm tra tính năng `tests/store_upgrades.test.ts` vượt qua (PASS)**

---

### Task 2: Backend API Phân Quyền (RBAC Middleware), Quản lý User & Audit Logs

**Files:**
- Modify: `src/server/routes/auth.ts`
- Modify: `src/server/routes/documents.ts`
- Modify: `src/server/routes/contracts.ts`
- Modify: `src/server/routes/categories.ts`
- Modify: `src/server/routes/partners.ts`
- Create: `src/server/routes/users.ts`
- Create: `src/server/routes/audit.ts`
- Modify: `src/server/index.ts`
- Test: `tests/rbac_api.test.ts`

**Interfaces:**
- Consumes: `validateToken`, `store.getUsers()`, `store.recordAuditLog()`
- Produces:
  - Middleware `requireAuth`, `requireAdmin` chặn User thông thường thao tác thay đổi dữ liệu (POST, PUT, PATCH, DELETE).
  - Endpoints `/api/users` (CRUD tài khoản, đổi mật khẩu, khoá/mở khoá - chỉ Admin).
  - Endpoints `/api/audit-logs` (lấy lịch sử thao tác hệ thống - chỉ Admin).

- [ ] **Step 1: Viết failing test trong `tests/rbac_api.test.ts` xác thực User chỉ được GET, bị 403 Forbidden khi POST/PATCH/DELETE**
- [ ] **Step 2: Triển khai middleware `requireAdmin`, `requireAuth` và cập nhật các route documents, contracts, categories, partners**
- [ ] **Step 3: Tạo `src/server/routes/users.ts` và `src/server/routes/audit.ts`, đăng ký vào `src/server/index.ts`**
- [ ] **Step 4: Chạy test xác minh phân quyền `tests/rbac_api.test.ts` (PASS)**

---

### Task 3: Backend & Frontend Hỗ trợ Đa Tiền Tệ (Multi-currency)

**Files:**
- Modify: `src/server/routes/categories.ts`
- Modify: `src/client/src/services/api.ts`
- Modify: `src/client/src/components/CategorySettingsView.tsx`
- Create: `src/client/src/utils/currency.ts`
- Modify: `src/client/src/components/CreateModal.tsx`
- Modify: `src/client/src/components/EditRecordModal.tsx`
- Modify: `src/client/src/components/ContractStatsBar.tsx`
- Test: `tests/currency.test.ts`

**Interfaces:**
- Consumes: API danh mục tiền tệ từ `/api/categories/currencies`
- Produces:
  - Quản lý danh mục tiền tệ (USD, KHR, VND, EUR, AUD, THB, CNY, SGD, JPY...) trong tab Cài đặt.
  - Dropdown chọn tiền tệ khi thêm/sửa hợp đồng hoặc công văn.
  - Hàm `formatCurrencyValue(amount, currencyCode)` định dạng đúng số lẻ và dấu phân cách.
  - Thống kê hợp đồng hiển thị tổng giá trị tách biệt theo từng đồng tiền.

- [ ] **Step 1: Viết test cho hàm định dạng và xử lý tiền tệ trong `tests/currency.test.ts`**
- [ ] **Step 2: Thêm endpoint quản lý tiền tệ trong backend và client `src/client/src/services/api.ts`**
- [ ] **Step 3: Cập nhật `CategorySettingsView.tsx` thêm tab "Quản lý Tiền tệ"**
- [ ] **Step 4: Cập nhật `CreateModal.tsx`, `EditRecordModal.tsx`, `ContractStatsBar.tsx` sử dụng đa tiền tệ**
- [ ] **Step 5: Chạy test kiểm tra (PASS)**

---

### Task 4: Nâng cấp Toàn diện Bộ lọc Bảng Hợp Đồng (Contract Filter Bar)

**Files:**
- Modify: `src/client/src/components/ContractTableView.tsx`
- Modify: `src/client/src/components/Sidebar.tsx`
- Test: `tests/contract_filter.test.ts`

**Interfaces:**
- Consumes: `ContractRecord[]`, danh mục tiền tệ và phòng ban
- Produces:
  - Thanh bộ lọc giống bảng Công văn: Tìm kiếm từ khoá, lọc theo Đối tác, Loại HĐ, Bộ phận, Trạng thái, Loại tiền tệ, Khoảng giá trị, Năm / Khoảng thời gian.
  - Nút Reset bộ lọc, hiển thị số kết quả tìm được.

- [ ] **Step 1: Viết test cho logic lọc hợp đồng đa tiêu chí trong `tests/contract_filter.test.ts`**
- [ ] **Step 2: Triển khai UI bộ lọc trong `ContractTableView.tsx` đồng bộ giao diện với `DocumentTableView.tsx`**
- [ ] **Step 3: Tích hợp sắp xếp theo cột và đếm số bản ghi phù hợp**
- [ ] **Step 4: Chạy test xác nhận (PASS)**

---

### Task 5: Xuất / Nhập Dữ liệu Excel (.xlsx) với Màn hình Xem Trước (Preview & Validation)

**Files:**
- Create: `src/client/src/utils/excelHelper.ts`
- Create: `src/client/src/components/ExcelManagerModal.tsx`
- Modify: `src/client/src/components/ContractTableView.tsx`
- Modify: `src/client/src/components/DocumentTableView.tsx`
- Modify: `src/server/routes/documents.ts` (hỗ trợ bulk upsert tương tự contracts)
- Test: `tests/excel_import_export.test.ts`

**Interfaces:**
- Consumes: `xlsx` library, API `/api/contracts/bulk-import`, `/api/documents/bulk-import`
- Produces:
  - Chức năng Export: Xuất file `.xlsx` cho Hợp đồng và Công văn (toàn bộ hoặc theo kết quả lọc), bao gồm cột ID.
  - Tải file mẫu template `.xlsx`.
  - Chức năng Import: Tải file `.xlsx` lên, phân tích cú pháp, kiểm tra tính hợp lệ dữ liệu.
  - Modal Preview: Thống kê số dòng thêm mới, số dòng cập nhật, danh sách dòng có lỗi chi tiết, Admin bấm xác nhận mới lưu vào database; ghi audit log.

- [ ] **Step 1: Viết test backend bulk upsert documents và parsing trong `tests/excel_import_export.test.ts`**
- [ ] **Step 2: Tạo module `src/client/src/utils/excelHelper.ts` để sinh và đọc `.xlsx` với SheetJS**
- [ ] **Step 3: Tạo component `ExcelManagerModal.tsx` gồm Preview, Validation và Tải file mẫu**
- [ ] **Step 4: Tích hợp Modal này vào `ContractTableView.tsx` và `DocumentTableView.tsx`**
- [ ] **Step 5: Chạy test xác minh (PASS)**

---

### Task 6: Hoàn thiện Tiếng Anh & Bổ sung Tiếng Khmer (i18n & Font Noto Sans Khmer)

**Files:**
- Modify: `src/client/src/i18n/index.ts`
- Create: `src/client/src/i18n/locales/vi.ts`
- Create: `src/client/src/i18n/locales/en.ts`
- Create: `src/client/src/i18n/locales/km.ts`
- Modify: `src/client/src/context/LanguageContext.tsx`
- Modify: `src/client/src/components/Header.tsx`
- Modify: `index.html` (thêm link Google Fonts Noto Sans Khmer / Khmer OS)
- Modify: `src/client/src/components/CategorySettingsView.tsx`, `CreateModal.tsx`, `DetailPane.tsx`, `Sidebar.tsx`...
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Consumes: Language context
- Produces:
  - 3 ngôn ngữ: Tiếng Việt, English, ភាសាខ្មែរ (Khmer).
  - Đảm bảo font chữ Khmer hiển thị tròn trịa, chuẩn đẹp.
  - Dịch 100% tất cả các nhãn, menu, trạng thái, modal, thông báo.

- [ ] **Step 1: Tạo bộ từ điển hoàn chỉnh `vi.ts`, `en.ts`, `km.ts`**
- [ ] **Step 2: Cập nhật `LanguageContext.tsx` hỗ trợ ngôn ngữ `km`, ghi nhớ ngôn ngữ người dùng**
- [ ] **Step 3: Cập nhật `index.html` nhúng font `Noto Sans Khmer`**
- [ ] **Step 4: Rà soát và thay thế các chuỗi hardcode tiếng Việt trong các component chính**
- [ ] **Step 5: Viết test kiểm tra tính đầy đủ của bộ khóa ngôn ngữ trong `tests/i18n.test.ts` (PASS)**

---

### Task 7: Giao diện Quản lý Người dùng, Phân Quyền UI & Nhật ký Audit Log

**Files:**
- Create: `src/client/src/components/UserManagerView.tsx`
- Create: `src/client/src/components/AuditLogView.tsx`
- Modify: `src/client/src/components/CategorySettingsView.tsx`
- Modify: `src/client/src/components/Sidebar.tsx`
- Modify: `src/client/src/components/Header.tsx`
- Modify: `src/client/src/App.tsx`
- Modify: `src/client/src/components/ContractTableView.tsx`, `DocumentTableView.tsx`, `DetailPane.tsx`
- Test: `tests/rbac_ui.test.ts`

**Interfaces:**
- Consumes: `useAuth()` hook (`user.role === 'admin' | 'user'`)
- Produces:
  - Ẩn nút Thêm mới, Sửa, Xóa, Import đối với tài khoản `user`.
  - Màn hình Quản lý tài khoản (tạo user, gán role admin/user, đặt lại mật khẩu, khoá tài khoản).
  - Màn hình xem Nhật ký thao tác (Audit Log) cho Admin.

- [ ] **Step 1: Tạo `UserManagerView.tsx` và `AuditLogView.tsx`**
- [ ] **Step 2: Thêm tab Quản lý Người dùng & Nhật ký hệ thống vào khu vực Cài đặt / Sidebar cho Admin**
- [ ] **Step 3: Cập nhật `App.tsx`, `ContractTableView`, `DocumentTableView`, `DetailPane` kiểm tra quyền theo role để ẩn các thao tác tạo/sửa/xóa với role `user`**
- [ ] **Step 4: Chạy toàn bộ test suite và build hoàn chỉnh `npm test && npm run build`**
