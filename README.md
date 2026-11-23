# DocHub - Hệ Thống Quản Lý Văn Bản & Hợp Đồng Siêu Tốc

Hệ thống quản lý văn bản, lưu trữ hợp đồng và tự động cảnh báo nhắc hạn hợp đồng theo phong cách **Minimal Luxury (Tối giản & Sang trọng đẳng cấp)**, xây dựng trên nền tảng **Cloudflare Edge (Workers, D1 SQLite, R2 Object Storage)** kết hợp **Hono.js** và **React 18/19 (Vite SPA)**.

---

## 🌟 Điểm Nổi Bật

1. **Tốc độ phản hồi cực nhanh (< 20ms)**:
   - Backend chạy trên Cloudflare Workers tại Edge.
   - Cơ sở dữ liệu Cloudflare D1 (SQLite phân tán) cho độ trễ truy vấn siêu thấp.
   - Tra cứu Spotlight (`⌘K`) tìm kiếm tức thì theo tiếng Việt có dấu hoặc không dấu.
2. **Bố cục 3 Cột Liền Mạch (Master-Detail Split View)**:
   - Bám sát chính xác các mẫu thiết kế cao cấp (`document-hub-refined.svg`).
   - Cột trái: Sidebar điều hướng và bộ lọc danh mục.
   - Cột giữa: Danh sách thẻ tóm tắt với badge đếm ngược ngày phát sáng (`🚨 Còn 4 ngày`, `🟠 Còn 18 ngày`, `🟢 Còn 142 ngày`).
   - Cột phải: Xem chi tiết và **Trình đọc tài liệu nhúng trực tiếp** (Zero-Download Preview).
3. **Tích Hợp Sẵn 3 Tệp Mẫu PPTX về Thi Hành Án Dân Sự (THADS)**:
   - `02/QĐ-THADS`: *Quy trình thủ tục thi hành án dân sự (THADS)* - [02_Quy_trinh_thu_tuc_THADS.pptx](src/client/public/samples/02_Quy_trinh_thu_tuc_THADS.pptx)
   - `03/HD-TDNH`: *Chuyên đề Thi hành án dân sự liên quan đến tổ chức tín dụng, ngân hàng* - [03_THADS_tin_dung_ngan_hang.pptx](src/client/public/samples/03_THADS_tin_dung_ngan_hang.pptx)
   - `04/CT-CCTH`: *Cưỡng chế thi hành án dân sự đối với tài sản của tổ chức tín dụng* - [04_Cuong_che_THADS_TCTD.pptx](src/client/public/samples/04_Cuong_che_THADS_TCTD.pptx)
4. **Hỗ trợ Giao diện Sáng & Tối (Light / Dark Theme)**:
   - Giao diện Sáng: Màu trắng sứ & ngọc thanh lịch kiểu Apple macOS.
   - Giao diện Tối: Màu Obsidian Slate huyền bí kiểu Linear/Raycast.
5. **Chi phí vận hành 0đ**:
   - Tối ưu hoàn toàn trong hạn mức miễn phí (Free Tier) cực kỳ hào phóng của Cloudflare.

---

## 🛠️ Công Nghệ Sử Dụng

- **Backend**: [Hono.js](https://hono.dev/) v4 trên Cloudflare Workers Runtime
- **Frontend**: [React 18](https://react.dev/), [Vite 6](https://vite.dev/), TypeScript
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database**: Cloudflare D1 (SQLite tại Edge)
- **File Storage**: Cloudflare R2 (Object Storage S3-compatible, Zero Egress Fee)
- **Testing**: Vitest

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Cục Bộ (Local Development)

### 1. Cài đặt thư viện
Yêu cầu **Node.js ≥ 22.13** (dùng `node:sqlite` cho cơ sở dữ liệu local).
```bash
npm install
```

### 2. Chạy Dev Server
Lệnh sau sẽ khởi động Vite dev server tích hợp sẵn API middleware của Hono:
```bash
npm run dev
```
Mở trình duyệt tại: `http://localhost:5180`

### 3. Chạy Kiểm Thử (Unit & Integration Tests)
```bash
npm run typecheck && npm test
```
Test chạy trên bản sao tạm của `data/`, không đụng dữ liệu thật.

**Smoke test end-to-end** ([scripts/smoke-test.mjs](scripts/smoke-test.mjs)) kiểm tra API trên bản local đang chạy:
```bash
SMOKE_BASE=http://localhost:5180 node scripts/smoke-test.mjs
```
Không có tài khoản thì chỉ chạy các kiểm tra công khai. Thêm `SMOKE_ADMIN_USER`/`SMOKE_ADMIN_PASS` (và tuỳ chọn `SMOKE_USER`/`SMOKE_USER_PASS` cho tài khoản thường) để kiểm tra các chức năng đọc. Thêm `--write` để thử cả các luồng ghi: script tạo bản ghi gắn nhãn `[SMOKE …]` rồi tự xoá khi xong. GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) chạy typecheck, test, build và đóng gói Worker cho mỗi push/PR.

### Kiểm tra tổng hợp & tài liệu vận hành
```bash
npm run check        # typecheck + test + build + wrangler dry-run
npm run smoke        # smoke test một bản đang chạy (SMOKE_BASE=...)
npm run dev:demo     # chạy local với dữ liệu giả lập
```
- Nhật ký công việc: [docs/WORKLOG.md](docs/WORKLOG.md)
- Bảo mật & phân quyền: [docs/ops/SECURITY.md](docs/ops/SECURITY.md)
- Lưu trữ D1/R2: [docs/ops/STORAGE.md](docs/ops/STORAGE.md) · Sao lưu/phục hồi: [docs/ops/BACKUP_RESTORE.md](docs/ops/BACKUP_RESTORE.md)
- Quy tắc nghiệp vụ: [docs/ops/BUSINESS_RULES.md](docs/ops/BUSINESS_RULES.md)
- Runbook triển khai: [docs/ops/DEPLOY_RUNBOOK.md](docs/ops/DEPLOY_RUNBOOK.md) · Phụ thuộc: [docs/ops/DEPENDENCIES.md](docs/ops/DEPENDENCIES.md)

### 4. Đóng gói Production (Build)
```bash
npm run build
```

---

## ☁️ Hướng Dẫn Triển Khai Lên Cloudflare (D1 & R2)

Kho cấu hình [wrangler.jsonc](wrangler.jsonc) đang trỏ tới Worker, D1 và R2 Production.
Quy trình hiện hành giữ nguyên schema trên D1 nguồn và chỉ nâng schema trên **D1 đích riêng** sau khi xác minh định danh, sao lưu và phục hồi.
Theo [runbook triển khai](docs/ops/DEPLOY_RUNBOOK.md) để xác nhận đích, quyền thực hiện và điều kiện mở ghi.

**Staging:** [Worker công khai](https://bpnm-doc-hub-staging.viettungcao2.workers.dev/) cần cấu hình Wrangler riêng đã xác minh.
Xem [cổng triển khai staging](docs/ops/DEPLOY_RUNBOOK.md#staging) trước khi dùng endpoint để kiểm thử.
Các script npm remote hiện gọi tên D1 Production cố định và không chuyển tiếp cấu hình hoặc môi trường Wrangler.

**Tại máy local:** `npm run dev` chạy migration SQLite tự động với `data/app.db`.
Dùng `npm run dev:demo` với thư mục dữ liệu local mới để thử bằng dữ liệu giả.
Xem [SECURITY.md](docs/ops/SECURITY.md) về `AUTH_SECRET` và đổi mật khẩu lần đầu.

---

## 📁 Cấu Trúc Thư Mục

```
document-manager/
├── design/                        # Bản vẽ thiết kế SVG mẫu
├── docs/superpowers/              # Spec đặc tả & Implementation Plan
├── src/
│   ├── server/                    # Backend Hono API (Edge Worker)
│   │   ├── db/                    # Bảng D1 (tables.ts), repository, store cache
│   │   ├── routes/                # documents, contracts, search, stats, files
│   │   ├── utils/                 # Thuật toán tính hạn urgency chuẩn UTC+7
│   │   └── types.ts               # Shared TypeScript Types
│   └── client/                    # Frontend React SPA (Vite)
│       ├── src/
│       │   ├── components/        # Header, Sidebar, ItemList, DetailPane, Modals...
│       │   ├── services/          # Client API fetcher
│       │   └── styles/            # Hệ thống CSS Design Tokens (Light/Dark)
│       └── public/samples/        # 3 file mẫu PPTX về THADS
├── migrations/                    # Migration D1/SQLite (triển khai remote theo runbook)
├── scripts/db-migrate.mjs         # Sao lưu + kiểm tra + áp migration
├── wrangler.jsonc                 # Cấu hình Cloudflare Worker, D1, R2, Assets
├── package.json
└── tsconfig.json
```
