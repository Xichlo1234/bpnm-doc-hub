# Runbook triển khai Production (cần phê duyệt)

> CI, công cụ AI và người không có phê duyệt **không** được deploy, migrate hay ghi dữ liệu Production.
> Người thực hiện: chủ dự án hoặc người được uỷ quyền có quyền Cloudflare. Mọi bước có tiêu chí
> **PASS / FAIL**; FAIL ở bất kỳ bước nào → dừng, xử lý theo mục 8 (giữ bảo trì hoặc sửa tiến).

## Tổng quan

| Bước | Việc | Ghi được? | Bằng chứng PASS |
|---|---|---|---|
| 0 | Điều kiện bắt đầu, ghi SHA | Có (Worker cũ) | checklist đủ |
| 1 | Preflight chỉ đọc trên Production | Có (Worker cũ) | không có `CHẶN:` |
| 2 | Deploy bản mới **ở chế độ bảo trì** | Không (qua API) | `/api/*` = 503, health = 200 |
| 3 | **Bật rào chắn ghi trong D1** và kiểm chứng | **Không (D1 từ chối)** | `write-fence verify` = PASS |
| 4 | Sao lưu D1 + R2, diễn tập phục hồi | Không | bản phục hồi khớp số bản ghi |
| 5 | Migration 0004 → 0011 theo thứ tự, từ đúng SHA | Không | preflight: không còn "Chờ áp dụng" |
| 6 | Kiểm tra toàn vẹn, gỡ rào chắn | Không (vẫn bảo trì) | `integrity_check = ok`, 0 trigger |
| 7 | Mở ghi, kiểm tra sau mở | Có | smoke chỉ đọc + kiểm tra tay |
| 8 | Sự cố: giữ bảo trì hoặc sửa tiến | — | — |

### Vì sao cần rào chắn ghi trong D1 (không chỉ chờ thời gian)
- `wrangler deploy` đưa **request mới** sang phiên bản mới, nhưng request **đang chạy** trên phiên bản cũ
  vẫn được chạy tiếp tới khi xong. Chờ một khoảng thời gian, hay thấy `meta.data_version` đứng yên, là
  **dấu hiệu**, không phải bằng chứng rằng không còn ghi nào từ bản cũ.
- Vì vậy bước 3 cài trigger `write_fence_*` (`scripts/write-fence.mjs`) lên mọi bảng bản cũ (0001–0003)
  ghi vào: mọi `INSERT/UPDATE/DELETE` bị D1 từ chối bằng `RAISE(ABORT, 'WRITE_FENCE…')`. Một batch của
  Worker cũ là một transaction nên bị huỷ **toàn bộ**: không có ghi dở dang nào lọt vào sau thời điểm này.
- Migration 0004–0011 chỉ `CREATE TABLE/INDEX`, `ALTER TABLE ADD COLUMN` và cập nhật bảng mới
  (`file_uploads`), nên chạy được khi rào chắn đang bật (đã diễn tập: `tests/pr09_stabilization.test.ts`
  › E7 và diễn tập workerd trong `docs/WORKLOG.md` › PR09).
- Bản mới ở chế độ bảo trì trả 503 cho mọi `/api/*` **trước khi** chạm D1/R2; `/api/health` không dùng D1
  nên chạy được cả trên schema 0001–0003. Nếu một ghi lọt tới D1 khi rào chắn bật, bản mới trả
  `503 MAINTENANCE` (lỗi xác định, không ghi gì).

### Ảnh hưởng của `MAINTENANCE_MODE`
`wrangler.jsonc` khai báo `vars.MAINTENANCE_MODE = "0"`; `--var MAINTENANCE_MODE:1` chỉ đổi biến này cho
phiên bản được deploy. **Không đổi:** route/tên miền (`bpnm.tungcv.vn`), binding D1/R2, secret
(`AUTH_SECRET` không nằm trong `vars` nên không bị xoá), static assets (giao diện vẫn tải, API báo bảo trì).
Kiểm tra: `npx wrangler deploy --dry-run --var MAINTENANCE_MODE:1` có cùng danh sách binding với bản thường.
**Không** đặt biến này qua Dashboard (lần deploy sau sẽ ghi đè, dễ mở ghi ngoài ý muốn).

---

## 0. Điều kiện bắt đầu (FAIL nếu thiếu bất kỳ mục nào)
- [ ] Reviewer độc lập kết luận **GO**; chủ dự án duyệt phương án cuối (mục "Phê duyệt" ở cuối).
- [ ] PR #1 → #9 đã merge vào `main` theo thứ tự; CI trên `main` xanh.
- [ ] SHA triển khai: `git rev-parse HEAD` = `__________` (`git status --short` rỗng). Mọi bước dùng SHA này.
- [ ] `npm ci && npm run check && npm run audit:prod` PASS trên máy triển khai.
- [ ] `npx wrangler secret list` có `AUTH_SECRET`. Không đổi secret trong lần này.
- [ ] `npx wrangler deployments list` → ghi Version ID đang chạy: `__________` (bản cũ, chỉ để tham chiếu).
- [ ] Thông báo người dùng khung giờ bảo trì (~30–45 phút, không ghi được từ bước 2 tới bước 7).

## 1. Preflight chỉ đọc (Production)
```bash
npm run preflight:remote          # chỉ SELECT/PRAGMA; in "Đã áp dụng", "Chờ áp dụng", số bản ghi, CẢNH BÁO, CHẶN
```
- **PASS:** không có dòng `CHẶN:`; "Đã áp dụng" có đủ 0001–0003; "Chờ áp dụng" đúng các migration của bản
  phát hành (0004 → 0011 nếu chưa từng áp dụng). Ghi lại "Số bản ghi" = `__________`.
- **FAIL (dừng, Worker cũ vẫn chạy bình thường, chưa có gì thay đổi):**
  - ledger `d1_migrations` lệch schema, cột đã tồn tại, thiếu 0001–0003;
  - tên đăng nhập trùng (0009 sẽ lỗi);
  - **mã đối tác trùng** giữa đối tác đang hoạt động theo khoá chuẩn hoá (chữ hoa/thường, khoảng trắng,
    dạng Unicode — `src/shared/partnerCodeKey.mjs`). Chủ dự án quyết định đổi mã hay đưa vào thùng rác;
    migration và ứng dụng **không** tự sửa;
  - `registry_conflicts` (số đã đăng ký cho hồ sơ khác).

## 2. Deploy bản mới ở chế độ bảo trì
```bash
git rev-parse HEAD                                     # = SHA mục 0
npm run build && npx wrangler deploy --var MAINTENANCE_MODE:1
npx wrangler deployments status                        # một phiên bản duy nhất, 100% lưu lượng
curl -s -o /dev/null -w '%{http_code}\n' https://bpnm.tungcv.vn/api/documents   # 503
curl -s https://bpnm.tungcv.vn/api/health                                       # 200 {"status":"ok"}
```
- **PASS:** cả hai lệnh `curl` đúng kỳ vọng, lặp lại 3 lần cách nhau 10 giây; `deployments status` chỉ có bản mới.
- **FAIL:** còn phiên bản cũ nhận lưu lượng (gradual deployment) → đưa bản bảo trì lên 100%
  (`npx wrangler versions deploy <version-id>@100%`), kiểm lại. Health ≠ 200 → giữ nguyên, điều tra (D1 chưa bị
  đụng tới; có thể deploy lại bản cũ ở bước này vì schema chưa đổi).

## 3. Bật rào chắn ghi trong D1 và kiểm chứng
```bash
node scripts/write-fence.mjs on --remote               # cài trigger write_fence_* (idempotent)
node scripts/write-fence.mjs verify --remote           # thử một UPDATE không đổi gì: D1 phải TỪ CHỐI
node scripts/write-fence.mjs status --remote           # số trigger (39 nếu đủ 13 bảng cũ)
npx wrangler d1 execute bpnm-doc-hub-db --remote --command "SELECT value FROM meta WHERE key='data_version'"
```
- **PASS:** `verify` in `PASS: D1 từ chối ghi` và thoát mã 0. Ghi lại `data_version` = `______`.
- **FAIL:** `verify` in `FAIL` → **không migrate**; chạy lại `on`, kiểm `status`. Không qua được → `off`,
  deploy lại bản cũ (schema chưa đổi), báo cáo.
- Từ đây: request ghi còn sót trên Worker cũ (nếu có) bị D1 huỷ cả batch; người dùng của bản cũ nhận lỗi, **không**
  có dữ liệu ghi dở.

## 4. Sao lưu D1 + R2 và diễn tập phục hồi
```bash
npx wrangler d1 export bpnm-doc-hub-db --remote --output backups/d1-pre-deploy-$(date +%Y%m%d-%H%M).sql
npx wrangler d1 time-travel info bpnm-doc-hub-db       # ghi bookmark: __________
```
R2: sao chép (không xoá gì) sang bucket sao lưu theo `BACKUP_RESTORE.md`; so số object và tổng dung lượng.

Diễn tập phục hồi (cục bộ, không đụng Production):
```bash
rm -f /tmp/restore-check.db && sqlite3 /tmp/restore-check.db < backups/d1-pre-deploy-*.sql
node scripts/preflight.mjs --file /tmp/restore-check.db    # số bản ghi = mục 1; "Đã áp dụng" = 0001–0003
node scripts/write-fence.mjs off --file /tmp/restore-check.db   # bản sao lưu có kèm trigger rào chắn: gỡ trên bản sao
```
- **PASS:** bản phục hồi mở được; số bản ghi khớp mục 1; vài object R2 trong bucket sao lưu tải được, đúng kích thước.
- **FAIL:** dừng (vẫn bảo trì, rào chắn vẫn bật). Không migrate khi chưa có bản sao lưu phục hồi được.

## 5. Migration theo thứ tự từ đúng SHA
```bash
git status --short                # rỗng; git rev-parse HEAD = SHA mục 0
npm run db:migrate:remote         # sao lưu thêm một lần, áp 0004 → 0011 theo thứ tự, in số bản ghi
npm run preflight:remote          # "Chờ áp dụng: (không có)"; CẢNH BÁO "Rào chắn ghi đang bật" là bình thường
```
| Migration | Nội dung (chỉ thêm) |
|---|---|
| 0004 | bảng `file_uploads` |
| 0005 | cột `users.can_access_confidential_documents`, `notifications.recipient_user_id` |
| 0006 | bảng `attachments`, `record_history`; cột `deleted_at/deleted_by` |
| 0007 | bảng `number_sequences`, `import_batches`, `write_guard` |
| 0008 | bảng `number_registry`, `number_guard` |
| 0009 | cột `revision` cho `partners`, `users`, `attachments`; `file_uploads.attached_at`; bảng `storage_cleanup`, `file_guard`; chỉ mục duy nhất tên đăng nhập |
| 0010 | chỉ mục duy nhất `idx_partners_code_active` trên `upper(trim(code))` (ASCII) |
| 0011 | cột `partners.code_key` + chỉ mục duy nhất `idx_partners_code_key_active` (khoá Unicode; ứng dụng điền khi khởi động) |

- **PASS:** lệnh migrate không lỗi; preflight không còn "Chờ áp dụng", không có `CHẶN:`; số bản ghi = mục 1.
- **FAIL giữa chừng:** giữ bảo trì **và** rào chắn. Ledger chỉ ghi migration đã thành công (mỗi migration
  là một transaction). Xử lý nguyên nhân (cần phê duyệt nếu phải sửa dữ liệu; khi đó gỡ rào chắn chỉ cho
  câu lệnh đã duyệt rồi bật lại), chạy lại `npm run db:migrate:remote` — đã diễn tập (E7 › roll forward).

## 6. Kiểm tra toàn vẹn, gỡ rào chắn (vẫn bảo trì)
```bash
npx wrangler d1 execute bpnm-doc-hub-db --remote --command "PRAGMA integrity_check"   # ok
npx wrangler d1 execute bpnm-doc-hub-db --remote --command "SELECT (SELECT COUNT(*) FROM documents) d, (SELECT COUNT(*) FROM contracts) c, (SELECT COUNT(*) FROM partners) p, (SELECT COUNT(*) FROM users) u"
node scripts/write-fence.mjs off --remote
node scripts/write-fence.mjs status --remote           # 0 trigger
npm run preflight:remote                               # không CHẶN, không cảnh báo rào chắn
```
- **PASS:** `ok`; số bản ghi = mục 1; 0 trigger; preflight sạch (`duplicate_partner_codes`, `registry_conflicts` rỗng).
- **FAIL:** giữ bảo trì; nếu dữ liệu hỏng → mục 8.3 (phục hồi).

## 7. Mở ghi
```bash
git rev-parse HEAD                                     # vẫn = SHA mục 0
npm run build && npx wrangler deploy --var MAINTENANCE_MODE:0
npx wrangler deployments status                        # ghi Version ID = MỐC AN TOÀN: __________
SMOKE_BASE=https://bpnm.tungcv.vn npm run smoke         # không truyền tài khoản: chỉ đọc
```
- **PASS:** smoke chỉ đọc đạt; kiểm tra tay đạt:
  - [ ] Đăng nhập admin; tài khoản còn dùng mật khẩu mặc định bị yêu cầu đổi mật khẩu.
  - [ ] Số văn bản/hợp đồng/đối tác trên giao diện = mục 1.
  - [ ] Mở một tệp đính kèm cũ: tải được (hiện là phiên bản 1).
  - [ ] Thiết lập → Thùng rác → **Chạy đối soát**: không có tệp thiếu.
  - [ ] `npm run preflight:remote`: `number_registry_rows` > 0; `partner_code_key_missing` = 0 (hoặc chỉ các mã trùng đã báo).
  - [ ] `GET /api/admin/storage-cleanup?status=pending` → `counts.pending` = 0.
- Smoke **có tài khoản** ghi nhẹ (nhật ký đăng nhập, phiên thu hồi) — chỉ khi chủ dự án chấp nhận.
  **Không bao giờ dùng `--write` trên Production.**
- **FAIL:** 5xx lặp lại, không đăng nhập được, số bản ghi lệch, tệp cũ không tải được → bật lại bảo trì ngay
  (`npx wrangler deploy --var MAINTENANCE_MODE:1`) → mục 8.

## 8. Sự cố: giữ bảo trì hoặc sửa tiến — không bao giờ quay về bản trước khi được gia cố bảo mật

**Mốc an toàn:** Version ID ghi ở mục 7. Bản cũ hơn **thiếu** các bảo vệ (văn bản Mật, chống ghi đè, sổ số,
xoá tệp hai pha) và ghi hồ sơ **không đăng ký số**. Vì vậy:

1. **Sự cố nhẹ → sửa tiến:** sửa trên nhánh mới, review, deploy bản mới (bước 2 → 7 nếu có migration mới).
2. **Sự cố nặng → bảo trì ngay**, không rollback mã cũ:
   `npx wrangler deploy --var MAINTENANCE_MODE:1` (thêm `node scripts/write-fence.mjs on --remote` nếu cần chặn
   tuyệt đối mọi ghi). Mở lại bằng `--var MAINTENANCE_MODE:0` sau khi sửa.
3. **Dữ liệu hỏng (hiếm):** phục hồi theo `BACKUP_RESTORE.md` — Time Travel về bookmark mục 4, hoặc nạp bản
   `.sql` vào database mới — rồi deploy bản ≥ mốc an toàn ở chế độ bảo trì, migrate lại (bước 5–7).
   Đã diễn tập trên bản sao (E7: phục hồi trả lại đúng database trước migration).
4. **Chỉ** `npx wrangler rollback <Version ID>` về bản **không cũ hơn mốc an toàn**. Trước mục 5 (schema chưa
   đổi) có thể quay về Version ID cũ ở mục 0 sau khi `write-fence off`.
5. **Nếu lỡ chạy bản cũ hơn mốc an toàn:** deploy lại bản ≥ mốc an toàn; `npm run preflight:remote` → xem
   `unregistered_numbers`; `POST /api/admin/number-registry/reconcile` (xem trước) → `?apply=1`; số trùng
   không gán lại tự động; Thùng rác → **Chạy đối soát**; `POST /api/admin/storage-cleanup`.
6. Ghi sự cố, SHA, Version ID, thời điểm vào `docs/WORKLOG.md`.

## 9. Diễn tập staging cục bộ (workerd, không cần tài khoản Cloudflare)
Chạy đúng runtime Workers (workerd) với D1/R2 mô phỏng, bắt đầu từ database chỉ có 0001–0003:
```bash
rm -rf .wrangler/state && export CI=true
for f in migrations/000[1-3]*.sql; do npx wrangler d1 execute bpnm-doc-hub-db --local --file "$f"; done
npx wrangler d1 execute bpnm-doc-hub-db --local --file <dữ-liệu-giả-lập.sql>   # kèm ledger d1_migrations 0001–0003
npm run build && npx wrangler dev --local --port 8787 --var MAINTENANCE_MODE:1 --var AUTH_SECRET:<chuỗi-thử>
node scripts/write-fence.mjs on --local && node scripts/write-fence.mjs verify --local
npx wrangler d1 export bpnm-doc-hub-db --local --output /tmp/stg-backup.sql
node scripts/db-migrate.mjs migrate --local
node scripts/preflight.mjs --file .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
node scripts/write-fence.mjs off --local
# khởi động lại wrangler dev với MAINTENANCE_MODE:0, rồi:
SMOKE_BASE=http://localhost:8787 SMOKE_ADMIN_USER=... SMOKE_ADMIN_PASS=... node scripts/smoke-test.mjs --write
```
Kết quả lần diễn tập gần nhất: `docs/WORKLOG.md` › PR09.

## 10. Vận hành định kỳ
- Hằng ngày: sao lưu D1; `POST /api/admin/storage-cleanup` (thử lại xoá R2 lỗi; `GET` để xem tồn đọng).
- Hằng tuần: Thiết lập → Thùng rác → **Chạy đối soát**; preflight chỉ đọc (`partner_code_key_missing`,
  `unregistered_numbers`, tệp tải lên chưa gắn do lỗi commit không xác định).

## Phê duyệt (chủ dự án điền)
| Mục | Người duyệt | Thời điểm |
|---|---|---|
| Reviewer độc lập: GO | | |
| Phương án triển khai này (SHA, khung giờ) | | |
| Đọc Production (bước 1) | | |
| Bảo trì + rào chắn + migrate + deploy (bước 2–7) | | |
