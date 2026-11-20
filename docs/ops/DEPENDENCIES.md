# Kiểm tra phụ thuộc (dependencies)

Lần kiểm tra: PR05 (`npm audit`).

| Gói | Loại | Tình trạng | Xử lý |
|---|---|---|---|
| `hono` 4.13.13 → **4.13.19** | runtime | lỗ hổng mức trung bình | Đã nâng cấp |
| `zod` 3.23 → **4.6.7** | runtime | GHSA-mrhx-c7xc-m3w5 (cạn bộ nhớ) | Đã nâng cấp (một thay đổi API `z.record`); thêm giới hạn 12MB cho mọi request API |
| `vite` 6.4.5 → **6.4.6** | build | bản vá | Đã nâng cấp |
| `xlsx` 0.18.5 | client (đọc/ghi Excel trong trình duyệt) | Prototype Pollution, ReDoS — **không có bản sửa trên npm** | Chỉ xử lý tệp người dùng tự chọn trong trình duyệt của họ; server không phân tích Excel. Đề xuất: chuyển sang bản SheetJS 0.20.x từ `cdn.sheetjs.com` hoặc `exceljs` (cần chủ dự án quyết định) |
| `wrangler` 3, `vitest` 2, `esbuild`, `ws`, `sharp`, `tinypool`… | chỉ dùng khi phát triển/CI | có cảnh báo | Không đóng gói vào Worker. Nâng cấp lớn (wrangler 4, vitest 5) nên làm thành PR riêng |

CI chạy `npm audit --omit=dev` (in báo cáo) và chặn khi có lỗ hổng mức **critical** ở phụ thuộc runtime.
