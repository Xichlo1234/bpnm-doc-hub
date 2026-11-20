# Nhật ký công việc — Hoàn thiện BPNM Doc Hub

Nhật ký cho người review (kể cả công cụ AI khác) đọc nhanh: đã làm gì, ở nhánh/PR nào, kiểm thử ra
sao, còn gì tồn đọng. Mỗi PR một mục; các PR xếp chồng theo thứ tự (PR02 dựa trên PR01, ...).

## Bối cảnh & quy ước

- Nhánh gốc: `main` (= mã nguồn import ban đầu). Mỗi nhóm việc một nhánh `prNN-...` và một PR.
- Không deploy Production, không chạy migration Production, không ghi dữ liệu thật. Mọi kiểm thử chạy
  trên SQLite local với bộ dữ liệu giả lập `tests/fixtures` (đã ẩn danh).
- Lệnh kiểm tra: `npx tsc --noEmit -p .`, `npm test`, `npx vite build`,
  `npx wrangler deploy --dry-run --outdir dist/worker`.
- Migration mới đều **chỉ thêm** (CREATE TABLE IF NOT EXISTS / ADD COLUMN). Trước khi deploy phải
  chạy `npm run db:migrate:remote` (script tự sao lưu D1 trước).

---

## PR01 — Bảo mật & phân quyền
Nhánh `pr01-security-rbac` → `main` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/1

| Hạng mục | Đã làm | Tệp chính |
|---|---|---|
| Phân quyền tập trung | `canReadDocument/Contract`, `canUploadFiles`; văn bản Mật/Tối mật/Tuyệt mật cần cờ `can_access_confidential_documents` | `src/server/utils/access.ts` |
| Bảo mật tệp R2 | Upload chỉ admin/người quản lý HĐLĐ; bảng `file_uploads` (chủ sở hữu, SHA-256); đọc tệp theo hồ sơ tham chiếu; chặn gắn `file_key` của người khác | `utils/fileAccess.ts`, `routes/files.ts`, `migrations/0004` |
| Không tệp mồ côi | Kiểm tra dữ liệu/quyền trước khi ghi R2; rollback tệp khi lưu D1 lỗi | `utils/recordRequest.ts` |
| Mật khẩu | Backend chặn mọi API khi `must_change_password` (403 `PASSWORD_CHANGE_REQUIRED`); bật cho tài khoản khởi tạo, mật khẩu mặc định đã công bố, mật khẩu admin đặt; màn đổi mật khẩu | `routes/auth.ts`, `ChangePasswordView.tsx` |
| Session | Đăng nhập username không tồn tại vẫn tốn PBKDF2 (chống dò); giữ cơ chế HMAC + thu hồi | `routes/auth.ts` |
| Thông báo theo người dùng | `recipient_user_id`; xem/đánh dấu đọc chỉ của mình | `routes/notifications.ts`, `migrations/0005` |
| Header bảo mật | CSP, HSTS, X-Frame-Options, Permissions-Policy | `src/server/index.ts` |
| Dữ liệu thật trong mã nguồn | Gỡ `excel_*.json` (bị đóng vào Worker), `data/*.json`, `data/uploads`, 2 file Excel tham chiếu; fixtures ẩn danh cho test; `SEED_DEMO=1` cho demo local | `db/seed.ts`, `tests/fixtures/` |
| CI | Chạy mọi nhánh/PR; kiểm tra bundle không chứa dữ liệu nghiệp vụ | `.github/workflows/ci.yml` |
| Test | `tests/access_control.test.ts`, mở rộng `tests/security.test.ts` | |

Kiểm thử: typecheck ✔, 239 test ✔, build ✔, wrangler dry-run ✔.

---

## PR02 — Lưu trữ D1/R2
Nhánh `pr02-storage` → `pr01-security-rbac`

| Hạng mục | Đã làm | Tệp chính |
|---|---|---|
| Nhiều tệp/hồ sơ + phiên bản | Bảng `attachments` (series/version/is_current, tên gốc, dung lượng, loại, SHA-256, người/thời gian tải); API thêm/thay/gỡ; hồ sơ cũ hiện tệp như v1 | `migrations/0006`, `routes/attachments.ts`, `utils/attachments.ts`, `AttachmentsPanel.tsx` |
| Không báo thành công sai | Thành công chỉ sau khi D1 commit; lỗi D1 → xoá tệp vừa ghi, trả lỗi; thông điệp form sửa đổi thành "đã tải lên, bấm Lưu để gắn" | `routes/documents.ts`, `routes/contracts.ts` |
| Xoá mềm/thùng rác/khôi phục | `deleted_at/deleted_by` cho văn bản, hợp đồng, đối tác; `/api/trash` (xem, khôi phục, xoá vĩnh viễn — xoá tệp R2 sau commit nếu không còn tham chiếu) | `routes/trash.ts`, `TrashView.tsx` |
| Lịch sử chỉnh sửa | Bảng `record_history` ghi diff từng trường trong cùng transaction; `/api/history/:type/:id`; panel lịch sử | `db/store.ts`, `routes/history.ts`, `HistoryPanel.tsx` |
| Vị trí hồ sơ giấy | Trường chuẩn Kho/Tủ/Ngăn/Hộp → `storage_location` thống nhất | `db/store.ts` (`withStorageLocation`), `PaperLocationFields.tsx` |
| Google Drive | Làm rõ là **liên kết**, không đồng bộ (nhãn 3 ngôn ngữ + `link_only`) | i18n, `routes/files.ts` |
| Đối soát D1/R2 | `/api/admin/storage-check` chỉ đọc: tệp thiếu & tệp mồ côi | `routes/admin.ts` |
| Sao lưu/phục hồi | Tài liệu quy trình + test xuất SQL → phục hồi DB trống → so khớp | `docs/ops/BACKUP_RESTORE.md`, `tests/backup_restore.test.ts` |
| Test | `tests/storage.test.ts` (15 test), `tests/backup_restore.test.ts` | |

Kiểm thử: typecheck ✔, 255 test ✔, build ✔, wrangler dry-run ✔.

---

## Danh sách chờ chủ dự án quyết định

1. **Lịch sử git** vẫn chứa dữ liệu thật ở commit đầu (repo đã private). Xoá hẳn cần viết lại lịch sử
   (force-push) — chưa làm.
2. **Quy tắc văn bản Mật**: hiện tại chỉ admin hoặc tài khoản được cấp cờ mới xem được. Nếu muốn
   người xử lý được giao cũng xem được văn bản Mật đó, cần xác nhận.
3. **Deploy & migration Production** (0004, 0005, 0006): chờ phê duyệt.
