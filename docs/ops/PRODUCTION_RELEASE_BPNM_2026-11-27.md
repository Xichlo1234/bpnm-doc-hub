# Nhật ký phát hành Production BPNM: 27/11/2026

**Trang:** https://bpnm.tungcv.vn · Worker `bpnm-doc-hub` · D1 `bpnm-doc-hub-db` (`3b47381d-1449-403c-9c84-87f81213010c`) · R2 `bpnm-doc-hub-files`
**Mục tiêu:** đưa BPNM lên cùng mã với document-manage (`14d5846`, nhánh `release/bpnm`) để hai đơn vị dùng chung một mã nguồn.
**Thực hiện:** các lệnh ghi do chủ dự án chạy trên máy của mình; Claude Code kiểm tra chỉ đọc sau mỗi bước.

## Trước khi làm (chỉ đọc)
- Bản cũ: version `981adc4f` (deploy 20/11, từ `main`).
- Ledger D1: 0001–0003. Chờ: 0004–0011.
- Preflight: 0 văn bản, 0 hợp đồng, 0 đối tác, 3 tài khoản, 0 thông báo; không trùng số, không lỗi chặn.
- Secret: `AUTH_SECRET` có sẵn, giữ nguyên.

## Các bước (UTC)
| Bước | Thời điểm | Kết quả |
|---|---|---|
| 1. Deploy `14d5846` với `MAINTENANCE_MODE:1` | 16:04 | Version `776fc51d`. Health 200; `/api/auth/me`, `/api/documents` trả 503 MAINTENANCE |
| 2. Sao lưu | 16:05 | `wrangler d1 export` → `backup-bpnm-20261127.sql` (14 KB, 21 INSERT: 3 users, 3 app_config, 4 audit_logs, 5 auth_revoked_sessions, meta, ledger). Bookmark `00000029-00000002-00005130-f4a8a373c22f4153a15180e13637226f`. Tệp chứa mã băm mật khẩu: chủ dự án giữ, không đưa lên Git |
| 3. `wrangler d1 migrations apply` 0004→0011 | ~16:07 | Ledger 0001–0011, không còn chờ; số bản ghi không đổi; danh sách 50 bảng/chỉ mục trùng `document-manager-db` |
| 4. Deploy lại `MAINTENANCE_MODE=0` | 16:09 | Version `03a29a51`, 100%. Giao diện `index-CtZoY2S_.js`; health 200; API trả 401 khi chưa đăng nhập. Khóa đối tác Unicode 0011 được ứng dụng tự khởi tạo; preflight không còn cảnh báo |

Khôi phục nếu cần: `npx wrangler d1 time-travel restore bpnm-doc-hub-db --bookmark=00000029-00000002-00005130-f4a8a373c22f4153a15180e13637226f`.

## Sau phát hành
Workers Builds của `bpnm-doc-hub`: production branch `release/bpnm`, build `npm run build`, deploy `npx wrangler deploy` (cấu hình gốc của `wrangler.jsonc`).
