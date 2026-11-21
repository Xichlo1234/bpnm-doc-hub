# Runbook triển khai Production (cần phê duyệt)

> CI, công cụ AI và người không có phê duyệt **không** được deploy, migrate hay ghi dữ liệu Production.
> Người thực hiện: chủ dự án hoặc người được uỷ quyền có quyền Cloudflare.

## 0. Điều kiện bắt đầu (dừng nếu thiếu bất kỳ mục nào)
- [ ] PR #1 → #7 đã được duyệt và merge vào `main` theo thứ tự; CI trên `main` xanh.
- [ ] Ghi lại SHA sẽ triển khai: `git rev-parse HEAD` (trên `main` đã merge) = `__________`.
      Mọi bước sau chạy từ đúng SHA này (`git status` sạch, không có thay đổi cục bộ).
- [ ] `npm ci && npm run check && npm run audit:prod` đạt trên máy triển khai.
- [ ] `AUTH_SECRET` đã có (`npx wrangler secret list`). Không đổi secret trong lần này.
- [ ] Đã có bản sao lưu D1 **và** R2 trong 24 giờ, và đã **diễn tập phục hồi** bản sao lưu đó vào
      môi trường thử (mục 2) thành công.
- [ ] Thông báo người dùng khung giờ bảo trì (~15 phút).

## 1. Kiểm tra trước (chỉ đọc)
```bash
npm run preflight:remote          # đọc schema, ledger d1_migrations, dữ liệu cũ, số trùng — không ghi
```
- **Dừng** nếu có dòng `CHẶN:` (ledger lệch schema, thiếu 0001–0003, cột đã tồn tại…).
- `Chờ áp dụng` phải đúng là các migration của bản phát hành (0004 → 0009 nếu chưa từng áp dụng).
- **Dừng** nếu có tên đăng nhập trùng (không phân biệt hoa thường): 0009 tạo chỉ mục duy nhất và sẽ lỗi.
- Ghi lại số bản ghi (documents, contracts, partners, users, notifications) để đối chiếu sau triển khai.
- Nếu có "số trùng": migration 0008 **không** sửa hay xoá các hồ sơ đó (hồ sơ cũ nhất giữ số, các hồ sơ
  khác vẫn sửa được). Ghi lại danh sách để rà soát sau, không phải điều kiện dừng.

## 2. Sao lưu (bắt buộc ngay trước khi migrate)
```bash
npx wrangler d1 export bpnm-doc-hub-db --remote --output backups/d1-pre-deploy-$(date +%Y%m%d-%H%M).sql
npx wrangler d1 time-travel info bpnm-doc-hub-db      # ghi lại bookmark/thời điểm hiện tại
```
R2: sao chép (không xoá gì) sang bucket sao lưu theo `BACKUP_RESTORE.md`. Kiểm tra tệp `.sql` vừa xuất
mở được và có `INSERT INTO "documents"`.

## 3. Migration
```bash
npm run db:migrate:remote        # tự sao lưu thêm một lần, rồi áp 0004 → 0009, rồi in số bản ghi
npm run preflight:remote         # kỳ vọng: "Chờ áp dụng: (không có)", không có "CHẶN:"
```
| Migration | Nội dung (chỉ thêm) |
|---|---|
| 0004 | bảng `file_uploads` |
| 0005 | cột `users.can_access_confidential_documents`, `notifications.recipient_user_id` |
| 0006 | bảng `attachments`, `record_history`; cột `deleted_at/deleted_by` |
| 0007 | bảng `number_sequences`, `import_batches`, `write_guard` |
| 0008 | bảng `number_registry`, `number_guard` (số nghiệp vụ duy nhất ở tầng D1) |
| 0009 | cột `revision` cho `partners`, `users`, `attachments`; `file_uploads.attached_at`; bảng `storage_cleanup`, `file_guard`; chỉ mục duy nhất tên đăng nhập |

**Tiêu chí dừng:** lệnh migrate lỗi; preflight sau migrate có `CHẶN:`; số bản ghi khác bước 1 → không deploy,
chuyển sang mục 6.

## 4. Deploy đúng SHA
```bash
git rev-parse HEAD                # phải trùng SHA ghi ở mục 0
npm run deploy
npx wrangler deployments list     # ghi lại Version ID mới
```

## 5. Kiểm tra sau triển khai
**Chỉ đọc thực sự (không ghi gì):**
```bash
SMOKE_BASE=https://bpnm.tungcv.vn npm run smoke   # không truyền tài khoản: chỉ health + chặn truy cập ẩn danh
```
**Có ghi nhẹ (cần chấp nhận):** chạy `npm run smoke` *kèm* `SMOKE_ADMIN_USER/PASS` sẽ đăng nhập/đăng xuất:
ghi nhật ký đăng nhập (`audit_logs`), phiên bị thu hồi (`auth_revoked_sessions`), có thể bật bắt buộc đổi
mật khẩu nếu dùng mật khẩu mặc định. **Không bao giờ dùng `--write` trên Production.**

Kiểm tra tay:
- [ ] Đăng nhập admin; tài khoản còn dùng mật khẩu mặc định bị yêu cầu đổi mật khẩu.
- [ ] Số lượng văn bản/hợp đồng/đối tác trên giao diện khớp số ghi ở mục 1.
- [ ] Mở một tệp đính kèm cũ: tải được (hiện là phiên bản 1).
- [ ] Thiết lập → Thùng rác → **Chạy đối soát**: không có tệp thiếu.
- [ ] `meta.number_registry_backfill` đã có (preflight hiển thị `number_registry_rows` > 0) và
      `unregistered_numbers` rỗng.
- [ ] Preflight không báo tệp chờ xoá (`storage_cleanup_pending` = 0); nếu có: `POST /api/admin/storage-cleanup`.
- [ ] (Tuỳ chọn) Gán người nhận cho thông báo cũ: `POST /api/notifications/assign-legacy` (chạy thử, chỉ
      báo cáo) → xem kết quả → `?apply=1` nếu đồng ý. Chỉ gán khi khớp đúng một tài khoản.

**Tiêu chí dừng / rollback:** lỗi 5xx lặp lại, không đăng nhập được, số bản ghi lệch, tệp cũ không tải được.

## 6. Rollback — không bao giờ quay về bản trước khi được gia cố bảo mật

**Mốc an toàn:** bản phát hành đầu tiên chứa PR #1 → #7 (ghi Version ID ở mục 4: `__________`).
Các bản cũ hơn **thiếu** các bảo vệ (thông báo/tệp văn bản Mật, chống ghi đè, sổ số nghiệp vụ):
chạy lại chúng làm tái xuất hiện lỗi bảo mật và ghi hồ sơ **không đăng ký số**. Vì vậy:

1. **Sự cố nhẹ → sửa tiến (roll-forward):** sửa lỗi trên nhánh mới, review, deploy bản mới.
2. **Sự cố nặng, cần dừng ngay → chế độ bảo trì, không rollback mã cũ:**
   ```bash
   npx wrangler deploy --var MAINTENANCE_MODE:1     # mọi API trả 503 MAINTENANCE, /api/health vẫn chạy, không ghi DB
   ```
   Sửa lỗi, deploy lại **không** có biến này để mở lại.
3. **Chỉ được** `npx wrangler rollback <Version ID>` về một bản **không cũ hơn mốc an toàn**.
   Schema mới chỉ thêm bảng/cột nên các bản từ mốc an toàn trở đi đều dùng được.
4. **Nếu lỡ chạy một bản cũ hơn mốc an toàn** (dù chỉ vài phút):
   - deploy lại bản ≥ mốc an toàn ngay;
   - `npm run preflight:remote` → xem `unregistered_numbers` (hồ sơ bản cũ đã ghi mà không đăng ký số);
   - `POST /api/admin/number-registry/reconcile` (chạy thử) → xem `missing` và `conflicts` → `?apply=1`
     để đăng ký bổ sung. Số trùng (`conflicts`) **không** được gán lại tự động: rà soát và đổi số thủ công
     qua form sửa;
   - Thiết lập → Thùng rác → **Chạy đối soát** và `POST /api/admin/storage-cleanup` (tệp chờ xoá).
5. **Dữ liệu:** thường không cần khôi phục. Chỉ khi dữ liệu hỏng: phục hồi theo `BACKUP_RESTORE.md`
   (Time Travel về thời điểm mục 2, hoặc nạp bản `.sql` vào database mới). Không xoá bảng mới.
6. Ghi lại sự cố, SHA, Version ID, thời điểm vào `docs/WORKLOG.md`.

## 7. Vận hành định kỳ
- Hằng ngày: sao lưu D1; `POST /api/admin/storage-cleanup` để thử lại các lần xoá tệp R2 bị lỗi
  (`storage_cleanup.status = 'pending'`, có `attempts` và `last_error`).
- Hằng tuần: Thiết lập → Thùng rác → **Chạy đối soát**.
