# Runbook triển khai Production (cần phê duyệt)

> CI, công cụ AI và người không có phê duyệt **không** được deploy, migrate hay ghi dữ liệu Production.
> Người thực hiện: chủ dự án hoặc người được uỷ quyền có quyền Cloudflare.

## 0. Điều kiện bắt đầu (dừng nếu thiếu bất kỳ mục nào)
- [ ] PR #1 → #6 đã được duyệt và merge vào `main` theo thứ tự; CI trên `main` xanh.
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
- `Chờ áp dụng` phải đúng là các migration của bản phát hành (0004 → 0008 nếu chưa từng áp dụng).
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
npm run db:migrate:remote        # tự sao lưu thêm một lần, rồi áp 0004 → 0008, rồi in số bản ghi
npm run preflight:remote         # kỳ vọng: "Chờ áp dụng: (không có)", không có "CHẶN:"
```
| Migration | Nội dung (chỉ thêm) |
|---|---|
| 0004 | bảng `file_uploads` |
| 0005 | cột `users.can_access_confidential_documents`, `notifications.recipient_user_id` |
| 0006 | bảng `attachments`, `record_history`; cột `deleted_at/deleted_by` |
| 0007 | bảng `number_sequences`, `import_batches`, `write_guard` |
| 0008 | bảng `number_registry`, `number_guard` (số nghiệp vụ duy nhất ở tầng D1) |

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
- [ ] `meta.number_registry_backfill` đã có (preflight hiển thị `number_registry_rows` > 0).
- [ ] (Tuỳ chọn) Gán người nhận cho thông báo cũ: `POST /api/notifications/assign-legacy` (chạy thử, chỉ
      báo cáo) → xem kết quả → `?apply=1` nếu đồng ý. Chỉ gán khi khớp đúng một tài khoản.

**Tiêu chí dừng / rollback:** lỗi 5xx lặp lại, không đăng nhập được, số bản ghi lệch, tệp cũ không tải được.

## 6. Rollback
1. **Mã:** `npx wrangler rollback` (về Version ID trước). Các migration chỉ thêm bảng/cột nên bản trước
   vẫn đọc/ghi được schema mới (đã kiểm thử: `tests/migrations.test.ts`, mục "rollback").
2. **Dữ liệu:** thường không cần. Chỉ khi dữ liệu hỏng: phục hồi theo `BACKUP_RESTORE.md` (Time Travel về
   thời điểm mục 2, hoặc nạp bản `.sql` vào database mới rồi chuyển `database_id`). Không xoá bảng mới.
3. Ghi lại sự cố, SHA, Version ID, thời điểm vào `docs/WORKLOG.md`.
