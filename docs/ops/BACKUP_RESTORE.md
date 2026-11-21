# Sao lưu & phục hồi (D1 + R2)

## Sao lưu D1
```bash
npx wrangler d1 export bpnm-doc-hub-db --remote --output backups/d1-$(date +%Y%m%d-%H%M).sql
```
`npm run db:migrate:remote` tự sao lưu như trên trước mỗi lần migrate. `backups/` nằm trong `.gitignore`:
**không commit bản sao lưu** (chứa dữ liệu thật và mật khẩu đã băm). Lưu ở kho nội bộ có kiểm soát truy cập.
Khuyến nghị: hằng ngày, giữ 30 bản; luôn có một bản ngay trước mỗi lần deploy/migrate.

D1 Time Travel (khôi phục về thời điểm bất kỳ trong 30 ngày):
```bash
npx wrangler d1 time-travel info bpnm-doc-hub-db
npx wrangler d1 time-travel restore bpnm-doc-hub-db --timestamp=<ISO-8601>   # ghi đè DB đang chạy: chỉ khi được duyệt
```

## Sao lưu R2
Dùng API tương thích S3 với **token chỉ đọc** cho bucket nguồn. Chỉ **sao chép**, không bao giờ xoá ở đích:
```bash
rclone copy r2:bpnm-doc-hub-files ./backups/r2-$(date +%Y%m%d) --checksum
```
Mỗi tệp có SHA-256 trong `file_uploads` / `attachments` để kiểm tra toàn vẹn.

## Phục hồi — luôn vào nơi mới trước, không đè lên dữ liệu đang chạy
### D1
1. Tạo database mới và nạp bản sao lưu:
   ```bash
   npx wrangler d1 create bpnm-doc-hub-restore
   npx wrangler d1 execute bpnm-doc-hub-restore --remote --file backups/d1-YYYYMMDD-HHMM.sql
   ```
   (Bản export của wrangler đã gồm `CREATE TABLE`; nếu bản sao lưu chỉ có dữ liệu thì chạy
   `wrangler d1 migrations apply bpnm-doc-hub-restore --remote` trước.)
2. Kiểm tra chỉ đọc: `node scripts/preflight.mjs --file <bản sao local>` hoặc truy vấn đếm bản ghi.
3. Chỉ khi được duyệt: đổi `database_id` trong `wrangler.jsonc` sang database đã phục hồi rồi deploy.

### R2
1. **Chạy thử trước** (không ghi gì) vào một bucket phục hồi riêng:
   ```bash
   rclone copy ./backups/r2-YYYYMMDD r2:bpnm-doc-hub-files-restore --checksum --dry-run
   rclone copy ./backups/r2-YYYYMMDD r2:bpnm-doc-hub-files-restore --checksum
   ```
2. Nếu phải đưa tệp về bucket đang chạy: chỉ bổ sung tệp thiếu, không ghi đè, không xoá:
   ```bash
   rclone copy ./backups/r2-YYYYMMDD r2:bpnm-doc-hub-files --ignore-existing --checksum --dry-run   # xem trước
   rclone copy ./backups/r2-YYYYMMDD r2:bpnm-doc-hub-files --ignore-existing --checksum
   ```
   **Không dùng `rclone sync`** vào bucket đang hoạt động (sync xoá tệp ở đích không có trong nguồn).
3. Thiết lập → Thùng rác → **Chạy đối soát** (`GET /api/admin/storage-check`): không còn tệp thiếu.

## Diễn tập phục hồi (trước mỗi lần deploy)
1. Xuất D1 (mục trên) → nạp vào SQLite cục bộ hoặc database `*-restore`.
2. `node scripts/preflight.mjs --file <bản phục hồi>`: đủ bảng, ledger đúng, số bản ghi khớp bản gốc.
3. Ghi kết quả (thời gian, số bản ghi) vào `docs/WORKLOG.md`.

## Kiểm thử tự động
- `tests/backup_restore.test.ts`: xuất SQL → phục hồi vào DB trống cùng schema → so khớp toàn bộ bản ghi.
- `tests/migrations.test.ts`: database giống Production (chỉ 0001–0003 + dữ liệu biên) → preflight chỉ đọc →
  áp 0004–0008 → dữ liệu cũ không đổi → ứng dụng chạy → bản cũ (rollback) vẫn ghi được.
