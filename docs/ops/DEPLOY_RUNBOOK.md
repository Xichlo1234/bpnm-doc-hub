# Runbook triển khai Production (cần phê duyệt)

> CI, công cụ AI và người không có phê duyệt **không** được deploy, migrate hay ghi dữ liệu Production.
> Người thực hiện: chủ dự án hoặc người được uỷ quyền có quyền Cloudflare.

## Cổng triển khai PR09 — chuyển sang D1/R2 riêng

Từ PR09, dùng quy trình ở mục này cho lần chuyển đổi đầu tiên. Các mục 0–7 bên dưới ghi lại quy trình PR08 và lệnh tham chiếu; không dùng lệnh migrate tại chỗ trên D1 nguồn cho lần chuyển đổi PR09. Giữ nguồn được bảo vệ qua hết cửa sổ xác minh.

| Bước | Thao tác trên môi trường được duyệt | PASS / FAIL |
|---|---|---|
| 1. Xác định nguồn | Xác nhận Deployment ID, SHA, toàn bộ route (kể cả workers.dev), Worker khác, tác vụ, token S3/API và binding cùng ghi D1/R2 nguồn. Thử toàn bộ quy trình dưới đây trên tài nguyên staging độc lập, với schema 0001–0003 và fixture giả. | PASS khi có danh sách đường ghi và bằng chứng staging. FAIL khi có tác nhân ghi chưa được xác định hoặc thiếu quyền khóa nguồn. |
| 2. Đóng ứng dụng | Đưa phiên bản bảo trì lên **100%** lưu lượng Cloudflare Workers. Dừng tác vụ/đường ghi ngoài Worker đã kiểm kê. Xác nhận mọi tài liệu/ghi API trả 503, health GET/HEAD trả 200. | PASS khi deployment và route khớp. Đây là kiểm tra mức phục vụ; request cũ đang chạy vẫn có thể tồn tại. |
| 3. Khóa tại lưu trữ | Áp dụng R2 Bucket Locks đã diễn tập, bao phủ tất cả key ứng dụng có thể ghi/xóa. Khóa bảo vệ thao tác xóa/ghi đè và hoàn tất upload đang chờ theo tài liệu nhà cung cấp; D1 vẫn phải khóa để một key mới không thể được đưa vào hồ sơ. Từ bản schema nguồn đã xác minh, tạo SQL `node scripts/cutover-fence.mjs --fence source-schema.sqlite`. Chủ dự án áp dụng SQL guard trên **D1 nguồn** bằng quy trình D1 SQL đã thử ở staging. Guard BEFORE INSERT/UPDATE/DELETE đồng nhất cho mọi bảng ứng dụng. Việc tạo trigger cùng giao dịch D1 là mốc cắt ghi. | PASS khi đối chiếu định nghĩa toàn bộ trigger với file SQL, lần thử ghi bằng bản Worker cũ lên fixture bị D1 từ chối, mẫu ghi đè/xóa qua cả S3 và Worker binding bị R2 chặn, và đối chiếu không có tính năng DDL ngoài quy trình. FAIL nếu D1/R2 staging không thể chứng minh bảo vệ. Thời gian chờ và `data_version` chỉ là bằng chứng phụ. |
| 4. Chụp bản sao | Sau khi hai khóa có hiệu lực, lưu exact export + bookmark D1 và manifest R2. Tạo D1 đích và R2 đích riêng. Khôi phục đúng đối tượng, kiểm tra toàn vẹn, đếm bản ghi và xác minh checksum/khả năng đọc tệp được hồ sơ tham chiếu. Sao lưu nguồn lưu riêng với quyền hạn phù hợp. | PASS khi số liệu bằng nguồn sau fence và mọi key có tham chiếu tồn tại. FAIL thì giữ bảo trì; không cắt sang đích. |
| 5. Nâng schema đích | Xác nhận UUID/database và bucket name là **đích**, và chỉ bản mới có binding tới đích. Nếu export mang theo trigger cutover, tạo lệnh gỡ định danh chính xác bằng `node scripts/cutover-fence.mjs --unfence target-copy.sqlite` và áp dụng **chỉ trên đích**. Dùng cấu hình Wrangler riêng với binding đích để apply 0004–0011. Chạy preflight, kiểm tra toàn vẹn và chạy lần khởi tạo khóa Unicode trên staging trước. | PASS khi ledger và schema hợp lệ, không còn trùng hoặc khóa đích sai. Nếu mã đối tác lịch sử trùng, dừng và trình danh sách để chủ dự án quyết định. |
| 6. Cắt sang bản mới | Triển khai đúng SHA đã duyệt 100% với binding **đích**. Xác minh health, phân quyền, truy cập hồ sơ và tệp mẫu; theo dõi commit có biên nhận, số bản ghi và lỗi. Mở ghi sau khi các kiểm tra đạt. | PASS khi UAT staging/kiểm tra đọc trước mở đạt và chỉ target nhận các ghi được duyệt. |
| 7. Khôi phục | Trước khi mở ghi target, có thể quay về nguồn theo kế hoạch riêng được duyệt, gỡ đúng guard/lock sau khi đổi đường phục vụ và kiểm tra lại. Sau khi target nhận ghi, giữ bảo trì và sửa tiến hoặc đối soát phần chênh rồi diễn tập phục hồi; không chuyển ngược trực tiếp về nguồn cũ. | FAIL nếu thiếu bản sao, quyền rollback, số liệu đối soát hoặc quyết định khi có ghi ở target. |

Tài liệu nhà cung cấp: [Workers deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/deployments/) · [D1 SQL](https://developers.cloudflare.com/d1/sql-api/sql-statements/) · [R2 Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).

Kiểm thử SQLite chỉ xác nhận trigger và quy trình khôi phục bản sao cục bộ. Kết quả live D1/R2, trigger batch của D1, khóa R2 qua binding, quyền môi trường và biên bản cutover vẫn là cổng staging bắt buộc.

## Runbook PR08 lưu để tham chiếu

## 0. Điều kiện bắt đầu (dừng nếu thiếu bất kỳ mục nào)
- [ ] PR #1 → #8 đã được duyệt và merge vào `main` theo thứ tự; CI trên `main` xanh.
- [ ] Ghi lại SHA sẽ triển khai: `git rev-parse HEAD` (trên `main` đã merge) = `__________`.
      Mọi bước sau chạy từ đúng SHA này (`git status` sạch, không có thay đổi cục bộ).
- [ ] `npm ci && npm run check && npm run audit:prod` đạt trên máy triển khai.
- [ ] `AUTH_SECRET` đã có (`npx wrangler secret list`). Không đổi secret trong lần này.
- [ ] Đã có bản sao lưu D1 **và** R2 trong 24 giờ, và đã **diễn tập phục hồi** bản sao lưu đó vào
      môi trường thử (mục 3) thành công.
- [ ] Thông báo người dùng khung giờ bảo trì (~30 phút; không ghi được trong suốt mục 1 → 5).

## Tổng quan: khoá ghi trước migration (7 bước)

| Bước | Việc | Ghi được? |
|---|---|---|
| 1 | Deploy bản mới **ở chế độ bảo trì** → Worker cũ ngừng nhận request ghi | Không |
| 2 | Chờ các request ghi đang chạy kết thúc, xác nhận `data_version` đứng yên | Không |
| 3 | Sao lưu D1 + R2, **diễn tập phục hồi** và kiểm tra bản phục hồi | Không |
| 4 | Migration theo thứ tự từ đúng SHA, preflight lại | Không |
| 5 | Deploy lại cùng SHA, vẫn bảo trì; kiểm tra toàn vẹn (chỉ đọc) | Không |
| 6 | Mở ghi (`MAINTENANCE_MODE:0`), kiểm tra sau mở | Có |
| 7 | Sự cố ở bất kỳ bước nào: **giữ bảo trì hoặc sửa tiến**, không rollback về bản dễ tổn thương | Không |

**Vì sao an toàn.** Middleware bảo trì của bản mới chạy *trước* mọi truy cập D1/R2 (có test
`tests/pr08_hardening.test.ts › D5`): các API nghiệp vụ trả `503 MAINTENANCE`; GET/HEAD `/api/health`
chỉ báo Worker đang hoạt động và trả 200 ngay trong middleware. Cả hai đường đều bỏ qua khởi tạo D1/R2.
Vì vậy bản mới chạy được trên schema cũ (0001–0003) trong lúc chờ migrate, và Worker cũ (không có
các bảo vệ ghi) bị thay thế **trước** khi schema đổi.

**Ảnh hưởng của việc bật/tắt `MAINTENANCE_MODE`.** `wrangler.jsonc` khai báo `vars.MAINTENANCE_MODE = "0"`;
`--var MAINTENANCE_MODE:1` chỉ ghi đè biến này cho phiên bản được deploy. Không đổi: route/tên miền
(`bpnm.tungcv.vn`), binding D1/R2, secret (`AUTH_SECRET` — secret không nằm trong `vars` nên không bị
xoá), static assets (vẫn phục vụ giao diện, giao diện hiện thông báo bảo trì). Kiểm tra bằng
`npx wrangler deploy --dry-run --var MAINTENANCE_MODE:1`: danh sách binding giống hệt bản thường, chỉ khác giá trị biến.
**Không** đặt biến này qua Dashboard (biến Dashboard bị lần deploy kế tiếp ghi đè, dễ mở ghi ngoài ý muốn).

## 1. Khoá ghi: deploy bản mới ở chế độ bảo trì
```bash
npm run preflight:remote                               # chỉ đọc; ghi lại số bản ghi, dừng nếu có "CHẶN:"
git rev-parse HEAD                                     # = SHA ở mục 0
npm run build && npx wrangler deploy --var MAINTENANCE_MODE:1
npx wrangler deployments list                          # bản mới nhận 100% lưu lượng (không gradual rollout)
curl -s https://bpnm.tungcv.vn/api/documents -o /dev/null -w '%{http_code}\n'   # kỳ vọng 503
curl -s https://bpnm.tungcv.vn/api/health                                       # kỳ vọng 200
```
**Dừng (giữ nguyên, không migrate)** nếu `/api/documents` không trả 503: còn phiên bản cũ đang phục vụ.
Nếu đang dùng gradual deployment (`wrangler versions`), đưa bản bảo trì lên 100% trước.

Preflight phải không có `CHẶN:`. Các điều kiện chặn chính:
- ledger `d1_migrations` lệch schema; thiếu 0001–0003; cột đã tồn tại;
- tên đăng nhập trùng (không phân biệt hoa thường) → 0009 sẽ lỗi;
- **mã đối tác trùng giữa các đối tác đang hoạt động**: preflight kiểm tra cả khóa SQL 0010
  (`duplicate_partner_index_codes`, gồm khóa rỗng) và mã chuẩn hóa Unicode của ứng dụng
  (`duplicate_partner_codes`), trước và sau migration. Xử lý dữ liệu sau khi được phê duyệt;
- ledger có 0010 nhưng thiếu `idx_partners_code_active`, hoặc chỉ mục này có định nghĩa khác migration 0010;
- `registry_conflicts`: số đã đăng ký cho hồ sơ khác nhưng hồ sơ khác lại đang dùng (do bản cũ ghi sau
  backfill). Rà soát, đổi số thủ công rồi chạy lại preflight.

Chỉ cảnh báo (không chặn): số trùng **lịch sử** trước khi có sổ số (hồ sơ cũ nhất giữ số),
`unregistered_numbers` (đối soát bằng `POST /api/admin/number-registry/reconcile` sau khi mở ghi).

## 2. Chờ request ghi đang chạy kết thúc
Request đang chạy trên Worker cũ có thể kéo dài tới giới hạn thời gian của Worker (≤ 30 giây). Chờ ít nhất
**2 phút**, rồi xác nhận không còn ghi:
```bash
npx wrangler d1 execute bpnm-doc-hub-db --remote --command "SELECT value FROM meta WHERE key='data_version'"
# chờ 60 giây, chạy lại: giá trị phải KHÔNG đổi. Đổi → còn ghi → quay lại mục 1.
npx wrangler tail --format pretty                       # (tuỳ chọn) chỉ thấy 503 trên /api/*
```

## 3. Sao lưu và diễn tập phục hồi (bắt buộc)
```bash
mkdir -p backups
backup_dir="$(mktemp -d backups/d1-pre-deploy.XXXXXX)"
d1_backup="$backup_dir/d1.sql"
npx wrangler d1 export bpnm-doc-hub-db --remote --output "$d1_backup"
npx wrangler d1 time-travel info bpnm-doc-hub-db        # ghi lại bookmark/thời điểm
```
R2: sao chép (không xoá gì) sang bucket sao lưu theo `BACKUP_RESTORE.md`; so số object và tổng dung lượng.

**Diễn tập phục hồi (cục bộ, không đụng Production):**
```bash
# Dùng đúng đường dẫn d1_backup vừa export ở trên.
restore_dir="$(mktemp -d)"
sqlite3 -bail "$restore_dir/restore-check.db" < "$d1_backup"
node scripts/preflight.mjs --file "$restore_dir/restore-check.db" # số bản ghi phải khớp mục 1
```
Mở một vài object R2 trong bucket sao lưu (tải được, đúng kích thước). **Dừng** nếu bản phục hồi
không mở được hoặc số bản ghi lệch.

## 4. Migration theo thứ tự từ đúng SHA
```bash
git status --short                # phải rỗng; git rev-parse HEAD = SHA mục 0
npm run db:migrate:remote         # tự sao lưu thêm một lần, áp 0004 → 0010 theo thứ tự, in số bản ghi
npm run preflight:remote          # kỳ vọng: "Chờ áp dụng: (không có)", không có "CHẶN:"
```
| Migration | Nội dung (chỉ thêm) |
|---|---|
| 0004 | bảng `file_uploads` |
| 0005 | cột `users.can_access_confidential_documents`, `notifications.recipient_user_id` |
| 0006 | bảng `attachments`, `record_history`; cột `deleted_at/deleted_by` |
| 0007 | bảng `number_sequences`, `import_batches`, `write_guard` |
| 0008 | bảng `number_registry`, `number_guard` (số nghiệp vụ duy nhất ở tầng D1) |
| 0009 | cột `revision` cho `partners`, `users`, `attachments`; `file_uploads.attached_at`; bảng `storage_cleanup`, `file_guard`; chỉ mục duy nhất tên đăng nhập |
| 0010 | chỉ mục duy nhất `idx_partners_code_active` trên `upper(trim(code))` cho đối tác chưa xoá |

**Lỗi giữa chừng:** giữ bảo trì (mục 7). Migration là các lệnh `CREATE`/`ALTER ADD`; ledger chỉ ghi
migration đã thành công nên có thể chạy lại lệnh sau khi xử lý nguyên nhân.

## 5. Kiểm tra toàn vẹn (vẫn bảo trì, chỉ đọc)
```bash
npm run preflight:remote          # không "CHẶN:", không "Chờ áp dụng"
npx wrangler d1 execute bpnm-doc-hub-db --remote --command "PRAGMA integrity_check"   # kỳ vọng: ok
npx wrangler d1 execute bpnm-doc-hub-db --remote --command "SELECT (SELECT COUNT(*) FROM documents) d, (SELECT COUNT(*) FROM contracts) c, (SELECT COUNT(*) FROM partners) p, (SELECT COUNT(*) FROM users) u"
```
- [ ] Số bản ghi khớp mục 1 (migration không thêm/xoá dòng nghiệp vụ).
- [ ] `duplicate_partner_codes`, `duplicate_partner_index_codes`, `registry_conflicts` rỗng.
- [ ] Chỉ mục của 0010 đúng biểu thức khóa và điều kiện; schema khớp ledger.

## 6. Mở ghi
```bash
git rev-parse HEAD                                     # vẫn = SHA mục 0
npm run build && npx wrangler deploy --var MAINTENANCE_MODE:0
npx wrangler deployments list                          # ghi lại Version ID = MỐC AN TOÀN
SMOKE_BASE=https://bpnm.tungcv.vn npm run smoke         # không truyền tài khoản: chỉ đọc
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
- [ ] `GET /api/admin/storage-cleanup?status=pending` → `counts.pending` = 0; nếu có: `POST /api/admin/storage-cleanup`.
- [ ] (Tuỳ chọn) Gán người nhận cho thông báo cũ: `POST /api/notifications/assign-legacy` (chạy thử) →
      `?apply=1` nếu đồng ý. Chỉ gán khi khớp đúng một tài khoản.

**Sự cố sau khi mở:** lỗi 5xx lặp lại, không đăng nhập được, số bản ghi lệch, tệp cũ không tải được →
bật lại bảo trì ngay (`npx wrangler deploy --var MAINTENANCE_MODE:1`) và xử lý theo mục 7.

## 7. Sự cố: giữ bảo trì hoặc sửa tiến — không bao giờ quay về bản trước khi được gia cố bảo mật

**Mốc an toàn:** bản phát hành đầu tiên chứa PR #1 → #8 (ghi Version ID ở mục 6: `__________`).
Các bản cũ hơn **thiếu** các bảo vệ (thông báo/tệp văn bản Mật, chống ghi đè, sổ số nghiệp vụ):
chạy lại chúng làm tái xuất hiện lỗi bảo mật và ghi hồ sơ **không đăng ký số**. Vì vậy:

1. **Sự cố nhẹ → sửa tiến (roll-forward):** sửa lỗi trên nhánh mới, review, deploy bản mới.
2. **Sự cố nặng, cần dừng ngay → chế độ bảo trì, không rollback mã cũ:**
   ```bash
   npx wrangler deploy --var MAINTENANCE_MODE:1     # mọi API trả 503 MAINTENANCE, /api/health vẫn chạy, không ghi DB
   ```
   Sửa lỗi trên nhánh mới (review), deploy lại với `--var MAINTENANCE_MODE:0` để mở lại.
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
   (Time Travel về thời điểm mục 3, hoặc nạp bản `.sql` vào database mới). Không xoá bảng mới.
6. Ghi lại sự cố, SHA, Version ID, thời điểm vào `docs/WORKLOG.md`.

## 8. Vận hành định kỳ
- Hằng ngày: sao lưu D1; `POST /api/admin/storage-cleanup` để thử lại các lần xoá tệp R2 bị lỗi
  (`storage_cleanup.status = 'pending'`, có `attempts` và `last_error`).
- Hằng tuần: Thiết lập → Thùng rác → **Chạy đối soát**.
