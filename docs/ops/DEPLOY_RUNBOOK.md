# Runbook triển khai Production (cần chủ dự án phê duyệt)

> Không ai trong quy trình tự động (CI, AI) được deploy hoặc migrate Production. Các bước dưới đây do
> người có quyền Cloudflare thực hiện sau khi PR đã được review và merge.

## 0. Trước khi bắt đầu
- [ ] PR01 → PR05 đã merge vào `main` theo thứ tự; CI trên `main` xanh.
- [ ] `npm ci && npm run check` chạy đạt trên máy triển khai.
- [ ] `AUTH_SECRET` đã có trên Worker (`npx wrangler secret list`). Không đổi secret này trong lần
      triển khai (đổi sẽ đăng xuất mọi người).
- [ ] Thông báo người dùng khung giờ bảo trì (~10 phút).

## 1. Sao lưu
```bash
npx wrangler d1 export bpnm-doc-hub-db --remote --output backups/d1-pre-deploy-$(date +%Y%m%d-%H%M).sql
```
Ghi lại thời điểm (dùng cho D1 Time Travel nếu cần quay lại). Sao lưu R2 theo `BACKUP_RESTORE.md`.

## 2. Migration (chỉ thêm, giữ tương thích dữ liệu cũ)
```bash
npm run db:status:remote      # xem trạng thái hiện tại
npm run db:migrate:remote     # tự sao lưu lần nữa rồi áp 0004 → 0007
npm run db:status:remote
```
| Migration | Nội dung |
|---|---|
| 0004 | bảng `file_uploads` (chủ sở hữu + SHA-256 của tệp tải lên) |
| 0005 | `users.can_access_confidential_documents`, `notifications.recipient_user_id` |
| 0006 | bảng `attachments`, `record_history`; cột `deleted_at/deleted_by` (văn bản, hợp đồng, đối tác) |
| 0007 | bảng `number_sequences`, `import_batches`, `write_guard` |

**Phải migrate trước khi deploy mã mới** (mã mới đọc/ghi các bảng, cột này).

## 3. Deploy
```bash
npm run deploy
```

## 4. Kiểm tra sau triển khai (chỉ đọc)
```bash
SMOKE_BASE=https://bpnm.tungcv.vn SMOKE_ADMIN_USER=<admin> SMOKE_ADMIN_PASS=<...> npm run smoke
```
(Không dùng `--write` trên Production.) Sau đó đăng nhập thử:
- [ ] Tài khoản còn dùng mật khẩu mặc định bị yêu cầu đổi mật khẩu → đổi được.
- [ ] Danh sách văn bản, hợp đồng, đối tác hiển thị đúng số lượng như trước.
- [ ] Mở một tệp đính kèm cũ: tải được (hiện là phiên bản 1 trong "Tệp đính kèm").
- [ ] Thiết lập → Thùng rác → **Chạy đối soát**: không có tệp thiếu.
- [ ] Người dùng thường không thấy văn bản "Mật"; cấp quyền ở Quản lý người dùng nếu cần.

## 5. Quay lại phiên bản trước (rollback)
1. Mã: `npx wrangler rollback` (về bản deploy trước).
2. Dữ liệu: các migration chỉ thêm bảng/cột, mã cũ vẫn chạy được với schema mới — thường **không cần**
   khôi phục DB. Chỉ khi dữ liệu bị hỏng: `npx wrangler d1 time-travel restore bpnm-doc-hub-db --timestamp=<thời điểm bước 1>`.

## Lưu ý vận hành
- Người dùng có thể bị yêu cầu đổi mật khẩu sau triển khai (mật khẩu mặc định / mật khẩu do admin đặt).
- Văn bản độ mật "Mật/Tối mật/Tuyệt mật" chỉ admin và người được cấp quyền mới xem được.
- Xoá giờ chuyển vào Thùng rác; xoá vĩnh viễn ở Thiết lập → Thùng rác.
