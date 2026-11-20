# Sao lưu & phục hồi (D1 + R2)

## Sao lưu D1 (cơ sở dữ liệu)

```bash
npx wrangler d1 export bpnm-doc-hub-db --remote --output backups/d1-$(date +%Y%m%d-%H%M).sql
```

`npm run db:migrate:remote` tự động sao lưu như trên trước mỗi lần áp migration. Thư mục `backups/`
nằm trong `.gitignore`: **không commit bản sao lưu** (chứa dữ liệu thật và mật khẩu đã băm). Lưu bản
sao lưu ở kho lưu trữ nội bộ có kiểm soát truy cập.

Khuyến nghị: sao lưu hằng ngày, giữ 30 bản gần nhất; trước mỗi lần deploy/migration luôn có một bản.

D1 còn có Time Travel (khôi phục về thời điểm bất kỳ trong 30 ngày):

```bash
npx wrangler d1 time-travel info bpnm-doc-hub-db
npx wrangler d1 time-travel restore bpnm-doc-hub-db --timestamp=<ISO-8601>
```

## Sao lưu R2 (tệp đính kèm)

R2 không có bản sao lưu tự động. Dùng API tương thích S3 (tạo R2 API token chỉ đọc cho bucket):

```bash
rclone sync r2:bpnm-doc-hub-files ./backups/r2-$(date +%Y%m%d)
```

Mỗi tệp có SHA-256 trong bảng `file_uploads`/`attachments`, dùng để kiểm tra tính toàn vẹn sau phục hồi.

## Phục hồi

1. **Phục hồi vào database mới trước, không ghi đè database đang chạy:**
   ```bash
   npx wrangler d1 create bpnm-doc-hub-restore
   npx wrangler d1 migrations apply bpnm-doc-hub-restore --remote
   npx wrangler d1 execute bpnm-doc-hub-restore --remote --file backups/d1-YYYYMMDD-HHMM.sql
   ```
   (Nếu file export đã chứa câu lệnh `CREATE TABLE`, bỏ bước `migrations apply`.)
2. Kiểm tra số bản ghi: `npx wrangler d1 execute bpnm-doc-hub-restore --remote --command "SELECT COUNT(*) FROM documents"`.
3. Khi đã xác nhận, đổi `database_id` trong `wrangler.jsonc` sang database đã phục hồi rồi deploy
   (cần chủ dự án phê duyệt).
4. Tệp R2: `rclone sync ./backups/r2-YYYYMMDD r2:bpnm-doc-hub-files`.
5. Chạy đối soát: Thiết lập → Thùng rác → **Chạy đối soát** (hoặc `GET /api/admin/storage-check`)
   để chắc chắn mọi tệp được hồ sơ tham chiếu đều tồn tại.

## Kiểm thử tự động

`tests/backup_restore.test.ts` xuất database thử nghiệm ra SQL, phục hồi vào database trống có cùng
schema (migrations/) và so sánh toàn bộ bản ghi (văn bản, hợp đồng, đối tác, người dùng, thông báo,
tệp đính kèm, cấu hình), kể cả chuỗi có dấu nháy và tiếng Việt.
