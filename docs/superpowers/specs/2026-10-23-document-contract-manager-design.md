# Tài liệu Thiết Kế Kiến Trúc & Đặc Tả Kỹ Thuật (Design Spec)
## Hệ Thống Quản Lý Văn Bản, Hợp Đồng & Nhắc Hạn Hợp Đồng Siêu Tốc

- **Ngày ban hành**: 2026-10-23
- **Nền tảng mục tiêu**: Cloudflare Edge (Workers, D1, R2, Pages/Assets)
- **Công nghệ chính**: Hono.js + React 18/19 (Vite, TypeScript)
- **Phong cách thiết kế**: Minimal Luxury (Linear / Raycast / Apple aesthetics)

---

## 1. Mục Tiêu & Phạm Vi (Goals & Scope)

### 1.1 Mục tiêu chính
1. **Lưu trữ & Phân loại văn bản**: Quản lý tập trung công văn đến, công văn đi, quyết định, tài liệu nội bộ; đính kèm và lưu trữ file an toàn trên Cloudflare R2.
2. **Quản lý hợp đồng chặt chẽ**: Quản lý thông tin đối tác, giá trị, thời hạn bắt đầu/kết thúc, điều khoản gia hạn, phụ lục hợp đồng và bản scan gốc.
3. **Nhắc hạn hợp đồng chủ động**: Tự động tính toán số ngày còn lại theo thời gian thực và phân loại mức độ khẩn cấp (Khẩn cấp ≤ 7 ngày, Sắp tới hạn ≤ 30 ngày, Quá hạn), hiển thị trực quan trên giao diện với badge đổi màu sinh động.
4. **Tra cứu siêu tốc (< 15ms)**: Tích hợp thanh tìm kiếm Spotlight (`Cmd + K`), hỗ trợ tìm kiếm toàn văn (FTS) và đa tiêu chí (số hiệu, đối tác, trích yếu, tag).
5. **Xem trước tài liệu tức thì (Zero-Download Preview)**: Tích hợp trình xem trước PDF/ảnh scan trực tiếp trên giao diện mà không cần tải file về máy tính.
6. **Tối giản & Sang trọng**: Giao diện Split-View 3 cột liền mạch, không chuyển trang rườm rà, hỗ trợ Dark/Light mode cao cấp.

### 1.2 Đối tượng sử dụng
Cá nhân, văn phòng quản lý hoặc nhóm doanh nghiệp vừa và nhỏ mong muốn một giải pháp vận hành mượt mà, phản hồi tức thì, chi phí hạ tầng tối ưu (hoàn toàn miễn phí trong hạn mức Cloudflare Free Tier).

---

## 2. Kiến Trúc Hệ Thống (System Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Người dùng / Trình duyệt                        │
│          React (Vite SPA) + TypeScript + Modern CSS Tokens             │
│          (Split-View Layout, Spotlight Cmd+K, In-app PDF Viewer)       │
└───────────────────┬────────────────────────────────▲───────────────────┘
                    │ Upload Multipart File          │ JSON / Stream
┌───────────────────▼────────────────────────────────┴───────────────────┐
│              Cloudflare Workers (Edge Computing Node)                  │
│                                                                        │
│   [Hono Web Framework API Layer]                                       │
│   ├── /api/documents       (Quản lý & phân loại văn bản)              │
│   ├── /api/contracts       (Quản lý hợp đồng & đếm ngược hạn)         │
│   ├── /api/stats           (Chỉ số KPI & cảnh báo khẩn cấp)            │
│   ├── /api/search          (Spotlight FTS Search API)                  │
│   └── /api/files           (Upload lên R2 & Stream tài liệu)           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │ D1 SQL Engine                  │ S3 API
┌───────────────────▼──────────────┐   ┌─────────────▼───────────────────┐
│     Cloudflare D1 (SQLite)       │   │        Cloudflare R2            │
│  - Bảng văn bản (documents)      │   │  - File hợp đồng scan / PDF     │
│  - Bảng hợp đồng (contracts)     │   │  - Phụ lục đính kèm             │
│  - Phụ lục (appendices)          │   │  - Văn bản đính kèm             │
│  - SQLite FTS5 Index             │   │  - Zero Egress Fee              │
└──────────────────────────────────┘   └─────────────────────────────────┘
```

---

## 3. Mô Hình Dữ Liệu Chi Tiết (Database Schema - Cloudflare D1)

### 3.1 Bảng Văn Bản (`documents`)
```sql
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    document_number TEXT NOT NULL,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK(doc_type IN ('incoming', 'outgoing', 'internal', 'decision', 'other')),
    issuer TEXT,
    signer TEXT,
    issue_date TEXT NOT NULL,
    received_date TEXT,
    summary TEXT,
    tags TEXT,
    file_key TEXT,
    file_name TEXT,
    file_size INTEGER,
    file_type TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_documents_issue_date ON documents(issue_date);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_number ON documents(document_number);
```

### 3.2 Bảng Hợp Đồng (`contracts`)
```sql
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    contract_number TEXT NOT NULL,
    title TEXT NOT NULL,
    contract_type TEXT NOT NULL CHECK(contract_type IN ('service', 'lease', 'procurement', 'labor', 'nda', 'other')),
    party_a TEXT NOT NULL,
    party_b TEXT NOT NULL,
    partner_tax_id TEXT,
    partner_contact TEXT,
    value REAL DEFAULT 0,
    currency TEXT DEFAULT 'VND',
    signed_date TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'liquidated', 'terminated')),
    renewal_terms TEXT,
    file_key TEXT,
    file_name TEXT,
    file_size INTEGER,
    file_type TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_contracts_party_b ON contracts(party_b);
```

### 3.3 Bảng Phụ Lục Hợp Đồng (`contract_appendices`)
```sql
CREATE TABLE IF NOT EXISTS contract_appendices (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    appendix_number TEXT NOT NULL,
    title TEXT NOT NULL,
    signed_date TEXT NOT NULL,
    new_end_date TEXT,
    summary TEXT,
    file_key TEXT,
    file_name TEXT,
    file_size INTEGER,
    file_type TEXT,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_appendices_contract_id ON contract_appendices(contract_id);
```

### 3.4 Bảng Tìm Kiếm Toàn Văn (`fts_records`)
Sử dụng Virtual Table SQLite FTS5 để hỗ trợ tìm kiếm siêu tốc:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS fts_records USING fts5(
    record_id,
    record_type, -- 'document' hoặc 'contract'
    title,
    number,
    parties_or_issuer,
    summary,
    tags
);
```

---

## 4. Đặc Tả Lưu Trữ Cloudflare R2 (Object Storage)

### 4.1 Quy tắc đặt tên Key
- Văn bản: `documents/{document_id}/{sanitized_filename}`
- Hợp đồng: `contracts/{contract_id}/{sanitized_filename}`
- Phụ lục: `contracts/{contract_id}/appendices/{appendix_id}/{sanitized_filename}`

### 4.2 Giới hạn & Định dạng được chấp nhận
- **Định dạng**: `.pdf`, `.docx`, `.doc`, `.xlsx`, `.png`, `.jpg`, `.jpeg`
- **Kích thước file tối đa**: 25 MB / file (phù hợp với hầu hết tài liệu scan và hợp đồng)
- **Bảo mật**: File được stream qua API Worker (`/api/files/:key`) có kiểm tra header và cache control tối ưu.

---

## 5. Logic Nghiệp Vụ & Phân Loại Hạn Hợp Đồng (Contract Urgency Rules)

Hệ thống tính toán `days_remaining` giữa ngày hiện tại (`today = YYYY-MM-DD`) và `end_date`:

$$\text{days\_remaining} = \text{end\_date} - \text{today}$$

| Trạng thái | Điều kiện logic | Nhãn hiển thị | Màu sắc giao diện |
| :--- | :--- | :--- | :--- |
| **Đã thanh lý** | `status = 'liquidated'` | `Đã thanh lý` | Xám nhạt (`#71717A`) |
| **Đã chấm dứt** | `status = 'terminated'` | `Đã chấm dứt` | Đen xám (`#52525B`) |
| **Quá hạn** | `status = 'active'` VÀ `days_remaining < 0` | `Quá hạn {X} ngày` | Đỏ đậm (`#BE123C`) |
| **Khẩn cấp (≤ 7 ngày)** | `status = 'active'` VÀ `0 <= days_remaining <= 7` | `Còn {X} ngày` | Đỏ Rose (`#F43F5E`) + pulse animation |
| **Cảnh báo sớm (≤ 15 ngày)**| `status = 'active'` VÀ `7 < days_remaining <= 15` | `Còn {X} ngày` | Cam đậm (`#EA580C`) |
| **Sắp hết hạn (≤ 30 ngày)** | `status = 'active'` VÀ `15 < days_remaining <= 30`| `Còn {X} ngày` | Vàng hổ phách (`#D97706`) |
| **Đang hiệu lực an toàn** | `status = 'active'` VÀ `days_remaining > 30` | `Còn {X} ngày` | Xanh ngọc Emerald (`#059669`) |
| **Vô thời hạn** | `status = 'active'` VÀ `end_date IS NULL` | `Vô thời hạn` | Xanh dương Sapphire (`#2563EB`) |

---

## 6. Thiết Kế Giao Diện Người Dùng (UI/UX - Minimal Luxury)

### 6.1 Bố cục 3 Cột (Master-Detail Split View)
1. **Header Toàn Cục**:
   - Logo thương hiệu + Tên ứng dụng (`Document Hub`).
   - Ô tìm kiếm Spotlight với phím tắt gợi ý `Cmd + K`.
   - Nút `+ Thêm mới` (Dropdown: Thêm văn bản / Thêm hợp đồng).
   - Nút chuyển Dark/Light Mode.
2. **Cột 1: Navigation & Quick Filters (Rộng 260px)**:
   - Mục **Hợp đồng**: Tất cả, 🔴 Khẩn cấp (≤ 7 ngày), 🟠 Sắp hết hạn (≤ 30 ngày), 🟢 Đang hiệu lực, Đã thanh lý.
   - Mục **Văn bản**: Tất cả, Công văn đến, Công văn đi, Quyết định, Nội bộ.
   - Vùng **Dropzone nhanh**: Thả file để tải lên tức thì.
3. **Cột 2: Danh Sách Thẻ Tóm Tắt (Rộng 380px)**:
   - Thẻ danh sách được hiển thị thanh lịch, gọn gàng.
   - Mỗi item hiển thị: Tiêu đề in đậm, Số hiệu tài liệu, Tên đối tác / Cơ quan, Badge thời hạn đếm ngược có màu sắc trực quan.
   - Item đang chọn được highlight viền và hiệu ứng đổ bóng mờ sang trọng.
4. **Cột 3: Khung Xem Chi Tiết & Tài Liệu Trực Tiếp (Chiếm phần còn lại)**:
   - Header thông tin đầy đủ (Giá trị, các bên tham gia, ngày ký, điều khoản gia hạn).
   - Thanh công cụ hành động: `Tải file về`, `Chỉnh sửa`, `Thanh lý hợp đồng`, `Thêm phụ lục`, `Xóa`.
   - **Trình đọc tài liệu nhúng**: Hiển thị PDF hoặc hình ảnh phóng to/thu nhỏ trực tiếp trong iframe/canvas.

### 6.2 Bảng Mã Màu Sang Trọng (Design Tokens)
- **Dark Mode Background**: `#09090B` (Zinc 950), Thẻ card: `#18181B` (Zinc 900), Viền: `#27272A` (Zinc 800).
- **Light Mode Background**: `#FAFAFB` (Off-white), Thẻ card: `#FFFFFF`, Viền: `#E4E4E7` (Zinc 200).
- **Màu nhấn thương hiệu (Accent)**: `#6366F1` (Indigo Neon) kết hợp gradient chuyển màu nhẹ.
- **Font chữ**: Inter, SF Pro Display, Segoe UI.

---

## 7. Thiết Kế API & Hono Endpoints

### 7.1 Documents API
- `GET /api/documents`: Lấy danh sách văn bản (query: `type`, `search`, `page`, `limit`).
- `GET /api/documents/:id`: Lấy chi tiết văn bản.
- `POST /api/documents`: Tạo mới văn bản (hỗ trợ multipart form data gồm metadata + file).
- `PUT /api/documents/:id`: Cập nhật thông tin văn bản.
- `DELETE /api/documents/:id`: Xóa văn bản và file liên quan trên R2.

### 7.2 Contracts API
- `GET /api/contracts`: Lấy danh sách hợp đồng kèm tính toán `days_remaining` và filter theo trạng thái (`urgency=urgent|warning|active|expired|liquidated`).
- `GET /api/contracts/:id`: Lấy chi tiết hợp đồng + danh sách phụ lục.
- `POST /api/contracts`: Tạo mới hợp đồng (metadata + file gốc).
- `PUT /api/contracts/:id`: Sửa thông tin hợp đồng.
- `PATCH /api/contracts/:id/liquidate`: Đổi trạng thái hợp đồng thành đã thanh lý.
- `POST /api/contracts/:id/appendices`: Thêm phụ lục cho hợp đồng.
- `DELETE /api/contracts/:id`: Xóa hợp đồng và file trên R2.

### 7.3 Search & Stats API
- `GET /api/search?q={query}`: Tra cứu Spotlight trả về kết quả gom nhóm theo `{ documents: [...], contracts: [...] }`.
- `GET /api/stats`: Thống kê tổng hợp (tổng văn bản, tổng hợp đồng, số lượng hợp đồng khẩn cấp, số lượng hợp đồng sắp hết hạn trong 30 ngày, tổng giá trị hợp đồng đang hiệu lực).

### 7.4 Files API (R2)
- `GET /api/files/:key`: Stream file từ R2 phục vụ xem trước (Preview) hoặc tải xuống.

---

## 8. Chiến Lược Kiểm Thử (Testing Strategy)

1. **Unit & Logic Tests**:
   - Kiểm thử thuật toán tính `days_remaining` và gán nhãn mức độ ưu tiên hợp đồng với các mốc thời gian biên (-1 ngày, 0 ngày hôm nay, 7 ngày, 15 ngày, 30 ngày, 31 ngày).
   - Kiểm thử logic tìm kiếm từ khóa tiếng Việt không dấu và có dấu.
2. **API Integration Tests**:
   - Kiểm thử các endpoint CRUD với D1 giả lập trong môi trường `@cloudflare/workers-types` hoặc local Miniflare.
   - Kiểm thử tải file lên R2 và đọc stream file.
3. **Frontend E2E & Visual Verification**:
   - Kiểm tra hiển thị Split-View trên desktop và responsive trên mobile.
   - Kiểm tra tính năng phím tắt `Cmd+K` mở Spotlight search.
   - Kiểm tra xem trước file PDF không bị lỗi CORS/broken viewer.

---

## 9. Tổ Chức Mã Nguồn (Source Tree)

```
document-manager/
├── wrangler.jsonc
├── package.json
├── tsconfig.json
├── vite.config.ts
├── schema.sql
├── src/
│   ├── server/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── documents.ts
│   │   │   ├── contracts.ts
│   │   │   ├── search.ts
│   │   │   ├── stats.ts
│   │   │   └── files.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   └── index.ts
│   │   └── types.ts
│   └── client/
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── Header.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   ├── ItemList.tsx
│       │   │   ├── DetailPane.tsx
│       │   │   ├── SpotlightSearch.tsx
│       │   │   ├── PdfPreview.tsx
│       │   │   ├── ContractModal.tsx
│       │   │   ├── DocumentModal.tsx
│       │   │   └── UrgencyBadge.tsx
│       │   ├── services/
│       │   │   └── api.ts
│       │   └── styles/
│       │       └── index.css
└── docs/
    └── superpowers/specs/
        └── 2026-10-23-document-contract-manager-design.md
```
