# Kế Hoạch Triển Khai (Implementation Plan)
## Hệ Thống Quản Lý Văn Bản, Hợp Đồng & Nhắc Hạn Hợp Đồng Siêu Tốc (DocHub)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hoàn chỉnh hệ thống Quản lý Văn bản, Hợp đồng và Nhắc hạn hợp đồng siêu tốc với Hono.js + React 18/19 (Vite) trên Cloudflare Workers (D1 & R2), giao diện 3 cột Split-View sang trọng theo thiết kế SVG mẫu, tích hợp sẵn 3 file mẫu PPTX về THADS.

**Architecture:** Full-stack Monorepo với Backend Hono.js chạy tại Edge Worker phục vụ REST/RPC API kết nối Cloudflare D1 (SQLite) và Cloudflare R2 (Storage); Frontend React + Vite biên dịch thành SPA tĩnh phân phối qua Cloudflare Assets với giao diện Split-View 3 cột và Spotlight Search `Cmd+K`.

**Tech Stack:** Hono.js, React 18/19, Vite, TypeScript, Cloudflare Workers/Wrangler, D1 SQLite, R2 Object Storage, Lucide React, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-23-document-contract-manager-design.md](file:///Users/vu/Documents/project/document-manager/docs/superpowers/specs/2026-10-23-document-contract-manager-design.md)
**Design References:** [design/document-hub-mockup.svg](file:///Users/vu/Documents/project/document-manager/design/document-hub-mockup.svg), [design/document-hub-refined.svg](file:///Users/vu/Documents/project/document-manager/design/document-hub-refined.svg)

## Global Constraints
- Nền tảng: Cloudflare Workers + D1 + R2 + Pages/Assets.
- Tốc độ: Phản hồi API và tra cứu D1 < 20ms tại Edge.
- Trải nghiệm giao diện: Bố cục 3 cột Split-View (Sidebar điều hướng - Danh sách thẻ - Chi tiết & Preview tài liệu), hỗ trợ chuyển đổi Light/Dark Mode.
- Tích hợp dữ liệu mẫu: Tích hợp trực tiếp 3 tệp mẫu PPTX (`02_Quy_trinh_thu_tuc_THADS.pptx`, `03_THADS_tin_dung_ngan_hang.pptx`, `04_Cuong_che_THADS_TCTD.pptx`) vào danh mục tài liệu mẫu với đầy đủ trích yếu, số hiệu và đính kèm tệp.
- An toàn xóa tệp: Tuân thủ quy tắc dùng lệnh `trash` trên macOS nếu có dọn dẹp file.

## Review Focus
1. **Tính toán số ngày còn lại (Days Remaining)**: Xử lý chính xác múi giờ Việt Nam (UTC+7) để tránh lệch 1 ngày khi so khớp `end_date` với `today`.
2. **Hợp đồng vô thời hạn**: Thuộc tính `end_date` là `null`/trống phải hiển thị badge `Vô thời hạn` mà không gây lỗi NaN hoặc crash bộ lọc.
3. **Tra cứu tiếng Việt có dấu và không dấu**: Người dùng gõ "hop dong", "thue nha" hay "hợp đồng", "thuê nhà" đều phải tìm ra kết quả chính xác.
4. **Xử lý tệp đính kèm lớn & định dạng PPTX/PDF**: Upload multipart an toàn lên R2, hiển thị thông tin dung lượng và cho phép tải xuống hoặc xem trước mượt mà.
5. **Đồng bộ trạng thái khi thanh lý**: Khi bấm "Thanh lý hợp đồng", trạng thái lập tức chuyển sang `liquidated`, gỡ bỏ khỏi danh sách cảnh báo khẩn cấp.

---

### Task 1: Thiết Lập Nền Tảng Dự Án (Project Scaffolding & Config)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `wrangler.jsonc`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: Môi trường build TypeScript, Vite dev server, Wrangler local environment cho D1 và R2.

- [ ] **Step 1: Viết cấu hình `package.json` và dependencies**
Cài đặt Hono, React, Vite, Lucide-react, Vitest, Wrangler và Cloudflare types.
- [ ] **Step 2: Viết cấu hình `wrangler.jsonc`**
Cấu hình D1 database binding `DB` và R2 bucket binding `BUCKET`, trỏ assets vào thư mục `dist/client`.
- [ ] **Step 3: Cấu hình `vite.config.ts` và `tsconfig.json`**
Thiết lập proxy API `/api` tới backend Hono khi dev và output thư mục build `dist/client`.
- [ ] **Step 4: Chạy cài đặt dependencies và kiểm tra build script**
Run: `npm install`
Expected: Cài đặt thành công không lỗi dependency.
- [ ] **Step 5: Commit**
```bash
git add package.json tsconfig.json vite.config.ts wrangler.jsonc vitest.config.ts package-lock.json
git commit -m "chore: scaffold project structure with hono, react, vite and wrangler"
```

---

### Task 2: Cơ Sở Dữ Liệu D1 & Thuật Toán Phân Loại Hạn Hợp Đồng

**Files:**
- Create: `src/server/db/schema.sql`
- Create: `src/server/utils/urgency.ts`
- Create: `tests/urgency.test.ts`
- Create: `src/server/types.ts`

**Interfaces:**
- Consumes: Cấu trúc bảng D1 từ Design Spec.
- Produces:
  - `calculateUrgency(endDate: string | null, status: string, today?: string): UrgencyInfo`
  - Types: `DocumentRecord`, `ContractRecord`, `UrgencyLevel`, `UrgencyInfo`.

- [ ] **Step 1: Viết failing test cho `calculateUrgency` trong `tests/urgency.test.ts`**
Kiểm thử các mốc: Quá hạn (-2 ngày), Khẩn cấp (3 ngày), Cảnh báo sớm (12 ngày), Sắp tới hạn (25 ngày), An toàn (90 ngày), Vô thời hạn (null), và Đã thanh lý.
- [ ] **Step 2: Chạy test để xác nhận test thất bại**
Run: `npx vitest run tests/urgency.test.ts`
Expected: FAIL do chưa có file `src/server/utils/urgency.ts`.
- [ ] **Step 3: Cài đặt `src/server/types.ts` và `src/server/utils/urgency.ts`**
Triển khai thuật toán tính ngày chênh lệch chuẩn UTC+7 và trả về label tiếng Việt (`Còn X ngày`, `Quá hạn X ngày`, `Vô thời hạn`, `Đã thanh lý`) cùng màu sắc tương ứng.
- [ ] **Step 4: Chạy lại test để xác nhận PASS**
Run: `npx vitest run tests/urgency.test.ts`
Expected: PASS 100%.
- [ ] **Step 5: Tạo file `src/server/db/schema.sql`**
Viết DDL tạo các bảng `documents`, `contracts`, `contract_appendices`, `fts_records` và các index.
- [ ] **Step 6: Commit**
```bash
git add src/server/db/schema.sql src/server/utils/urgency.ts src/server/types.ts tests/urgency.test.ts
git commit -m "feat: add d1 schema and contract deadline urgency calculator with tests"
```

---

### Task 3: Backend API Service & Tích Hợp 3 File Mẫu PPTX

**Files:**
- Create: `src/server/db/seed.ts`
- Create: `src/server/routes/documents.ts`
- Create: `src/server/routes/contracts.ts`
- Create: `src/server/routes/search.ts`
- Create: `src/server/routes/files.ts`
- Create: `src/server/index.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Consumes: `schema.sql`, `calculateUrgency`, 3 file pptx (`02_Quy_trinh_thu_tuc_THADS.pptx`, `03_THADS_tin_dung_ngan_hang.pptx`, `04_Cuong_che_THADS_TCTD.pptx`).
- Produces:
  - Hono app với các route: `/api/documents`, `/api/contracts`, `/api/search`, `/api/stats`, `/api/files/:key`.
  - Bộ dữ liệu mẫu khởi tạo (seed data) chứa 3 văn bản tương ứng 3 file PPTX và các hợp đồng mẫu.

- [ ] **Step 1: Viết test cho Hono API routes trong `tests/api.test.ts`**
Kiểm thử `GET /api/documents`, `GET /api/contracts` (có tính `days_remaining`), và `GET /api/search?q=THADS`.
- [ ] **Step 2: Chạy test để xác nhận test thất bại**
Run: `npx vitest run tests/api.test.ts`
Expected: FAIL do chưa cài đặt routes.
- [ ] **Step 3: Triển khai seed data tích hợp 3 file PPTX và sample contracts**
Tạo script nạp 3 file mẫu vào hệ thống với thông tin chi tiết:
  1. `02/QĐ-THADS`: Quy trình thủ tục thi hành án dân sự (Đính kèm `02_Quy_trinh_thu_tuc_THADS.pptx`)
  2. `03/HD-TDNH`: Thi hành án dân sự trong tín dụng ngân hàng (Đính kèm `03_THADS_tin_dung_ngan_hang.pptx`)
  3. `04/CT-CCTH`: Hướng dẫn cưỡng chế thi hành án tổ chức tín dụng (Đính kèm `04_Cuong_che_THADS_TCTD.pptx`)
  4. Các hợp đồng mẫu với đủ các trạng thái hạn (Khẩn cấp 4 ngày, Sắp hạn 18 ngày, An toàn 142 ngày, Đã thanh lý).
- [ ] **Step 4: Triển khai các Hono API Routes (`documents`, `contracts`, `search`, `stats`, `files`)**
Xử lý CRUD, upload multipart lên R2 (hoặc local storage fallback khi chạy dev), tìm kiếm mờ tiếng Việt.
- [ ] **Step 5: Chạy lại test để xác nhận PASS**
Run: `npx vitest run tests/api.test.ts`
Expected: PASS 100%.
- [ ] **Step 6: Commit**
```bash
git add src/server/ tests/api.test.ts
git commit -m "feat: implement hono api routes with integrated pptx sample documents"
```

---

### Task 4: Thiết Kế Design System & Layout 3 Cột (Split-View)

**Files:**
- Create: `src/client/styles/index.css`
- Create: `src/client/src/components/Header.tsx`
- Create: `src/client/src/components/Sidebar.tsx`
- Create: `src/client/src/components/UrgencyBadge.tsx`
- Create: `src/client/src/App.tsx`
- Create: `src/client/src/main.tsx`
- Create: `src/client/index.html`

**Interfaces:**
- Consumes: Mẫu SVG từ `design/document-hub-mockup.svg` và `design/document-hub-refined.svg`.
- Produces: Khung sườn Split-View 3 cột responsive, hỗ trợ Light Mode và Dark Mode, badge trạng thái phát sáng.

- [ ] **Step 1: Xây dựng hệ thống CSS Tokens (`src/client/styles/index.css`)**
Định nghĩa biến màu sắc chuẩn Apple & Linear cho Light Mode (`#fcfbf8`, `#f4f3ee`, `#25332f`) và Dark Mode (`#09090b`, `#18181b`), font Inter, scrollbar tùy chỉnh và animation mượt.
- [ ] **Step 2: Cài đặt Component `UrgencyBadge.tsx`**
Hiển thị nhãn đếm ngược với màu sắc động: Rose đỏ (`Còn 4 ngày`), Amber vàng (`Còn 18 ngày`), Emerald xanh (`Còn 142 ngày`), Xám (`Đã thanh lý`).
- [ ] **Step 3: Cài đặt Component `Header.tsx`**
Logo DocHub, thanh tìm kiếm mở Spotlight `⌘K`, nút `+ Thêm mới`, nút chuyển đổi Dark/Light mode.
- [ ] **Step 4: Cài đặt Component `Sidebar.tsx`**
Bộ lọc danh mục: Hợp đồng (Cần xử lý, Sắp đến hạn, Đang hiệu lực) và Văn bản (Công văn đến, Đi, Quyết định, Nội bộ), vùng thả tệp nhanh.
- [ ] **Step 5: Kiểm tra render Layout và chuyển đổi Theme**
Kiểm tra giao diện hiển thị đúng 3 cột, không bị vỡ layout trên các kích thước màn hình.
- [ ] **Step 6: Commit**
```bash
git add src/client/
git commit -m "feat: implement 3-column split view layout and theme system"
```

---

### Task 5: Danh Sách Thẻ Tóm Tắt & Bộ Lọc Nhanh (Middle List Pane)

**Files:**
- Create: `src/client/src/components/ItemList.tsx`
- Create: `src/client/src/components/FilterBar.tsx`
- Modify: `src/client/src/App.tsx`
- Create: `src/client/src/services/api.ts`

**Interfaces:**
- Consumes: Backend API `/api/contracts`, `/api/documents`.
- Produces: Cột giữa hiển thị danh sách thẻ văn bản và hợp đồng, hỗ trợ lọc nhanh theo danh mục và từ khóa.

- [ ] **Step 1: Cài đặt API Service client (`src/client/src/services/api.ts`)**
Các hàm `fetchDocuments()`, `fetchContracts()`, `searchAll()`, `createDocument()`, `createContract()`, `liquidateContract()`.
- [ ] **Step 2: Cài đặt Component `ItemList.tsx`**
Thẻ hiển thị: Icon định dạng (PDF/PPTX/DOCX), Tiêu đề, Số hiệu, Đối tác/Cơ quan, Ngày tháng, Badge thời hạn đếm ngược.
- [ ] **Step 3: Tích hợp logic lựa chọn item đang xem (Active state)**
Click vào thẻ bất kỳ sẽ đổi trạng thái active, cập nhật khung chi tiết cột 3 tức thì.
- [ ] **Step 4: Thử nghiệm lọc danh sách với 3 file mẫu PPTX**
Kiểm tra click vào filter "Văn bản" hiển thị đầy đủ 3 hồ sơ THADS kèm icon PPTX.
- [ ] **Step 5: Commit**
```bash
git add src/client/src/components/ItemList.tsx src/client/src/components/FilterBar.tsx src/client/src/services/api.ts src/client/src/App.tsx
git commit -m "feat: implement middle item list with quick filters and active card highlight"
```

---

### Task 6: Khung Chi Tiết & Trình Xem Tài Liệu Trực Tiếp (Right Detail Pane & Preview)

**Files:**
- Create: `src/client/src/components/DetailPane.tsx`
- Create: `src/client/src/components/DocumentViewer.tsx`
- Modify: `src/client/src/App.tsx`

**Interfaces:**
- Consumes: Dữ liệu văn bản hoặc hợp đồng đang được chọn.
- Produces: Khung hiển thị đầy đủ thông tin chi tiết, các nút hành động (Tải file, Chỉnh sửa, Tái ký, Thanh lý) và bản xem trước PDF/tài liệu nhúng.

- [ ] **Step 1: Cài đặt Component `DetailPane.tsx`**
Hiển thị thẻ chỉ số: Giá trị hợp đồng, Thời hạn còn lại, Trạng thái; bảng chi tiết Bên A, Bên B, Ngày ký, Điều khoản gia hạn.
- [ ] **Step 2: Cài đặt Component `DocumentViewer.tsx`**
Khung đọc tài liệu nhúng: Với file PDF hiển thị trình đọc nhúng; với 3 file mẫu PPTX hiển thị khung preview slide đẹp mắt kèm nút "Tải file về máy" trực tiếp từ R2/Local.
- [ ] **Step 3: Tích hợp thao tác "Thanh lý hợp đồng" trực tiếp trên DetailPane**
Nút "Thanh lý" chuyển trạng thái sang `liquidated` ngay lập tức và cập nhật lại badge mà không cần tải lại trang.
- [ ] **Step 4: Thử nghiệm xem chi tiết và tải xuống với 3 file PPTX mẫu**
Bấm chọn file PPTX mẫu -> Hiển thị trích yếu nội dung về Thi hành án dân sự -> Bấm "Tải file" tải thành công tệp gốc.
- [ ] **Step 5: Commit**
```bash
git add src/client/src/components/DetailPane.tsx src/client/src/components/DocumentViewer.tsx src/client/src/App.tsx
git commit -m "feat: implement detail pane with interactive preview and file download"
```

---

### Task 7: Spotlight Tra Cứu Siêu Tốc (`Cmd + K`) & Modal Thêm Mới

**Files:**
- Create: `src/client/src/components/SpotlightModal.tsx`
- Create: `src/client/src/components/CreateModal.tsx`
- Modify: `src/client/src/App.tsx`

**Interfaces:**
- Consumes: Phím tắt `Cmd+K` / `Ctrl+K`, API `/api/search`, API `/api/documents`, `/api/contracts`.
- Produces: Spotlight Search modal bật tức thì và Form thêm mới tài liệu/hợp đồng hỗ trợ kéo thả tệp.

- [ ] **Step 1: Cài đặt phím tắt toàn cục và Component `SpotlightModal.tsx`**
Lắng nghe `keydown` sự kiện `Meta+k` / `Ctrl+k`. Hiển thị hộp tìm kiếm Spotlight phong cách macOS.
- [ ] **Step 2: Tích hợp tìm kiếm real-time trong Spotlight**
Gõ từ khóa -> Gọi `/api/search` -> Hiển thị kết quả phân nhóm: [Hợp đồng] và [Văn bản]. Bấm vào mở ngay chi tiết.
- [ ] **Step 3: Cài đặt Form thêm mới `CreateModal.tsx`**
Tab chuyển đổi: Thêm Hợp đồng / Thêm Văn bản, trường nhập liệu đầy đủ, khu vực kéo thả tệp đính kèm.
- [ ] **Step 4: Kiểm tra tính năng tìm kiếm với từ khóa "THADS" và "ngân hàng"**
Xác nhận Spotlight gợi ý chính xác các file mẫu PPTX vừa tích hợp.
- [ ] **Step 5: Commit**
```bash
git add src/client/src/components/SpotlightModal.tsx src/client/src/components/CreateModal.tsx src/client/src/App.tsx
git commit -m "feat: implement cmd+k spotlight search and create record modal"
```

---

### Task 8: Kiểm Thử Toàn Diện, Tối Ưu Hóa & Đóng Gói Triển Khai Cloudflare

**Files:**
- Create: `README.md`
- Test: Toàn bộ test suite `npm test`
- Build: `npm run build`

**Interfaces:**
- Consumes: Toàn bộ source code Backend & Frontend.
- Produces: Production build bundle sẵn sàng deploy lên Cloudflare Workers/Pages qua `wrangler deploy`.

- [ ] **Step 1: Chạy toàn bộ Unit & Integration tests**
Run: `npm test`
Expected: Tất cả các bài kiểm tra logic nhắc hạn, tìm kiếm, API đều PASS.
- [ ] **Step 2: Chạy kiểm tra build production**
Run: `npm run build`
Expected: Biên dịch TypeScript và đóng gói Vite SPA thành công không có warning/error nghiêm trọng.
- [ ] **Step 3: Viết tài liệu hướng dẫn triển khai (`README.md`)**
Hướng dẫn chi tiết: Cách chạy dev cục bộ (`npm run dev`), cách tạo Cloudflare D1 database (`wrangler d1 create`), cách tạo R2 bucket (`wrangler r2 bucket create`), và lệnh deploy 1-click.
- [ ] **Step 4: Final commit**
```bash
git add README.md
git commit -m "docs: complete setup and deployment guide for cloudflare d1 r2"
```
