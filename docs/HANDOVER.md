# Tài liệu bàn giao — BPNM Doc Hub

## Hệ thống
- **Ứng dụng:** quản lý công văn đến/đi/nội bộ, hợp đồng, đối tác, tệp đính kèm; React SPA + API Hono trên
  Cloudflare Workers; dữ liệu D1 (SQLite), tệp R2. Tên miền `bpnm.tungcv.vn`.
- **Mã nguồn:** `src/server` (API), `src/client` (giao diện), `src/shared` (quy tắc dùng chung server/preflight),
  `migrations/` (0001 → 0011, chỉ thêm), `scripts/` (preflight, migrate, rào chắn ghi, smoke test).

## Mô hình dữ liệu và an toàn ghi (đọc trước khi sửa mã)
- Mỗi isolate giữ bộ đệm đã commit (`sharedStore`). Request **ghi** chạy tuần tự trong isolate, trên bản sao
  riêng, commit một batch D1 rồi mới thay bộ đệm chung (`runRequest` trong `src/server/db/store.ts`).
  Request **đọc** đọc bộ đệm đã commit và không được thay đổi nó (test bắt lỗi này).
- Giữa các isolate: mỗi batch kèm các kiểm tra trong D1 — revision (`write_guard`), số nghiệp vụ không cấp lại
  (`number_registry`/`number_guard`), tệp đã thu hồi (`file_guard`), chỉ mục duy nhất tên đăng nhập và mã đối tác
  (`code_key`). Vi phạm → huỷ cả batch → 409.
- Kết quả commit: thành công / bị từ chối (409, xoá tệp vừa tải nếu D1 xác nhận không ai tham chiếu) /
  **không xác định** (503 `COMMIT_UNKNOWN`, không xoá gì; người dùng tải lại để kiểm tra).
- Xoá tệp R2 hai pha (`storage_cleanup`): không bao giờ xoá object mà D1 còn tham chiếu.
- Văn bản Mật: chỉ admin và tài khoản được cấp quyền thấy (quyết định 2A).

## Vận hành
| Việc | Tài liệu |
|---|---|
| Triển khai / migration / bảo trì / rào chắn ghi | `docs/ops/DEPLOY_RUNBOOK.md` |
| Checklist phát hành | `docs/ops/RELEASE_CHECKLIST.md` |
| Sao lưu, phục hồi | `docs/ops/BACKUP_RESTORE.md` |
| Lưu trữ tệp, dọn dẹp R2 | `docs/ops/STORAGE.md` |
| Quy tắc nghiệp vụ (sổ số, quy trình) | `docs/ops/BUSINESS_RULES.md` |
| Bảo mật, phân quyền | `docs/ops/SECURITY.md` |
| Lịch sử thay đổi, quyết định | `docs/WORKLOG.md` |

## Lệnh thường dùng
```bash
npm ci && npm run check                     # typecheck + test + build + wrangler dry-run
npm run dev                                 # chạy cục bộ (data/app.db, tự migrate)
npm run preflight:remote                    # kiểm tra Production chỉ đọc (cần phê duyệt)
node scripts/write-fence.mjs status --remote
```

## Quyết định của chủ dự án đã ghi nhận
1A viết lại lịch sử git sau merge · 2A văn bản Mật chỉ admin/được cấp quyền · 3A tỷ giá 1 đơn vị = X tiền mặc định ·
4A SheetJS 0.20.3 từ CDN · 5 migration và deploy cần phê duyệt (reviewer độc lập GO + chủ dự án duyệt phương án).

## Việc còn mở
Xem `docs/REVIEW_REQUEST.md` › "Điều kiện Production còn thiếu" và "Rủi ro còn lại".
