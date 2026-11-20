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

**Smoke test end-to-end** ([scripts/smoke-test.mjs](scripts/smoke-test.mjs)) gọi toàn bộ API của một bản đang chạy (local, `wrangler dev` hoặc production):
```bash
SMOKE_BASE=https://quan-ly-cong-van.vcrm.vn node scripts/smoke-test.mjs
```
Không có tài khoản thì chỉ chạy các kiểm tra công khai. Thêm `SMOKE_ADMIN_USER`/`SMOKE_ADMIN_PASS` (và tuỳ chọn `SMOKE_USER`/`SMOKE_USER_PASS` cho tài khoản thường) để kiểm tra các chức năng đọc. Thêm `--write` để thử cả các luồng ghi: script tạo bản ghi gắn nhãn `[SMOKE …]` rồi tự xoá khi xong. GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) chạy typecheck, test, build và đóng gói Worker cho mỗi push/PR.

### 4. Đóng gói Production (Build)
```bash
npm run build
```

---

## ☁️ Hướng Dẫn Triển Khai Lên Cloudflare (D1 & R2)

### Bước 1: Đăng nhập Cloudflare Wrangler
```bash
npx wrangler login
```

### Bước 2: Tạo Cơ sở dữ liệu Cloudflare D1
```bash
npx wrangler d1 create document-manager-db
```
Sao chép `database_id` được sinh ra và dán vào file [wrangler.jsonc](wrangler.jsonc).

### Bước 3: Chạy migration D1
```bash
npm run db:migrate:remote
```
Script [scripts/db-migrate.mjs](scripts/db-migrate.mjs) làm 3 việc: kiểm tra an toàn, **sao lưu D1** vào `backups/`, rồi áp các file trong [migrations/](migrations/) bằng `wrangler d1 migrations apply`. Xem số bản ghi bất cứ lúc nào bằng `npm run db:status:remote`.

**Nâng cấp từ bản lưu blob JSON (trước P1):** sau khi migrate và deploy, request API đầu tiên sẽ tự chép toàn bộ dữ liệu từ `system_data` sang các bảng mới. Việc chép chạy đúng một lần, trong một transaction. Bảng `system_data` được giữ nguyên làm bản dự phòng. File cũ lưu base64 trong D1 sẽ được chép sang R2 khi được tải lần đầu.

**Mô hình lưu trữ:** mỗi văn bản, hợp đồng, đối tác, người dùng là một dòng riêng. Mỗi request chỉ ghi các dòng thay đổi, nên hai người sửa hai bản ghi khác nhau cùng lúc không còn ghi đè lên nhau. Nếu hai người cùng sửa **một** bản ghi, lần lưu sau cùng sẽ thắng.

Khi chạy local (`npm run dev`), dữ liệu nằm trong `data/app.db` (SQLite, dùng chung các file migration). Lần chạy đầu sẽ tự nhập từ các file `data/*.json` cũ.

### Bước 4: Tạo Bucket Cloudflare R2 (Lưu trữ tệp)
```bash
npx wrangler r2 bucket create document-manager-files
```

### Bước 5: Cấu hình khóa ký phiên đăng nhập (bắt buộc)
Token đăng nhập được ký HMAC-SHA256 bằng `AUTH_SECRET`. Thiếu biến này, Worker sẽ từ chối mọi đăng nhập.
```bash
openssl rand -base64 48 | npx wrangler secret put AUTH_SECRET
```
Đổi `AUTH_SECRET` sẽ đăng xuất toàn bộ người dùng. Khi chạy local (`npm run dev`) không cần biến này: máy chủ tự sinh khóa tạm cho mỗi tiến trình.

Tài khoản khởi tạo (`admin`, `user`) dùng mật khẩu mặc định và sẽ bị **bắt buộc đổi mật khẩu** ở lần đăng nhập đầu tiên.

### Bước 6: Triển khai 1-Click lên toàn cầu
```bash
npm run deploy
```
Worker của bạn sẽ được kích hoạt toàn cầu trên mạng lưới Edge của Cloudflare với tên miền tùy chọn dạng `https://document-manager.<your-subdomain>.workers.dev`.

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
├── migrations/                    # Migration D1/SQLite (áp bằng npm run db:migrate:remote)
├── scripts/db-migrate.mjs         # Sao lưu + kiểm tra + áp migration
├── wrangler.jsonc                 # Cấu hình Cloudflare Worker, D1, R2, Assets
├── package.json
└── tsconfig.json
```
