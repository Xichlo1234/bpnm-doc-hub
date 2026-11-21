# Kiểm tra phụ thuộc (dependencies)

Lần kiểm tra: PR05 (`npm audit`).

| Gói | Loại | Tình trạng | Xử lý |
|---|---|---|---|
| `hono` 4.13.13 → **4.13.19** | runtime | lỗ hổng mức trung bình | Đã nâng cấp |
| `zod` 3.23 → **4.6.7** | runtime | GHSA-mrhx-c7xc-m3w5 (cạn bộ nhớ) | Đã nâng cấp (một thay đổi API `z.record`); thêm giới hạn 12MB cho mọi request API |
| `vite` 6.4.5 → **6.4.6** | build | bản vá | Đã nâng cấp |
| `xlsx` 0.18.5 → **0.20.3** | client (đọc/ghi Excel trong trình duyệt) | Prototype Pollution, ReDoS ở 0.18.5 (không có bản sửa trên npm) | Đã chuyển sang bản chính thức của SheetJS từ `cdn.sheetjs.com` (quyết định 4A). `npm audit --omit=dev`: 0 lỗ hổng |
| `wrangler` 3, `vitest` 2, `esbuild`, `ws`, `sharp`, `tinypool`… | chỉ dùng khi phát triển/CI | có cảnh báo | Không đóng gói vào Worker. Nâng cấp lớn (wrangler 4, vitest 5) nên làm thành PR riêng |

CI chặn khi có lỗ hổng mức **high** hoặc **critical** ở phụ thuộc runtime (`npm run audit:prod`).
Lưu ý: `xlsx` được tải từ `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (đã khoá trong
`package-lock.json`); máy cài đặt/CI cần truy cập được host này.
