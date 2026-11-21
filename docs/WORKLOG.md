# Nhật ký công việc — Hoàn thiện BPNM Doc Hub

Nhật ký cho người review (kể cả công cụ AI khác) đọc nhanh: đã làm gì, ở nhánh/PR nào, kiểm thử ra
sao, còn gì tồn đọng. Mỗi PR một mục; các PR xếp chồng theo thứ tự (PR02 dựa trên PR01, ...).

## Bối cảnh & quy ước

- Nhánh gốc: `main` (= mã nguồn import ban đầu). Mỗi nhóm việc một nhánh `prNN-...` và một PR.
- Nhánh tích hợp `claude/vigilant-babbage-xm8dcm` luôn trỏ tới PR mới nhất (gồm mọi PR trước) để review/kiểm thử tổng thể.
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
Nhánh `pr02-storage` → `pr01-security-rbac` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/2

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

## PR03 — Logic nghiệp vụ
Nhánh `pr03-business-logic` → `pr02-storage` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/3

| Hạng mục | Đã làm | Tệp chính |
|---|---|---|
| Công văn đến | Tách số đến / số cơ quan gửi; quy trình Tiếp nhận → Phân công → Xử lý → Hoàn thành → Lưu trữ; lịch sử chỉ đạo `directive_log` | `utils/workflow.ts`, `utils/documentRules.ts`, `routes/documents.ts` (`/transition`), `WorkflowPanel.tsx` |
| Công văn đi | Dự thảo → Trình ký → Đã ký → Phát hành → Lưu trữ; mặc định Dự thảo; điều chỉnh sau phát hành cần lý do + được ghi lại | như trên, `EditRecordModal.tsx` |
| Chống trùng số | Bảng `number_sequences` cấp số nguyên tử; số tay trùng → 409; báo khi số bị cấp lại | `utils/numbering.ts`, `migrations/0007` |
| Hợp đồng | Kiểm tra mốc thời gian; chống trùng số; chấm dứt (lý do) / thanh lý (ngày); phụ lục & gia hạn; liên kết hồ sơ | `utils/contractRules.ts`, `routes/contracts.ts`, `ContractLifecyclePanel.tsx` |
| Đa tiền tệ | Thống kê theo từng loại tiền; tổng quy đổi chỉ khi đủ tỷ giá | `contractValueTotals` |
| Nhập Excel | Xem trước ở server (trùng, mới/cập nhật + trường thay đổi, lỗi); bắt xác nhận cập nhật; từ chối file có lỗi; nhật ký `import_batches` | `utils/importer.ts`, `routes/imports.ts`, `ExcelManagerModal.tsx` |
| Chỉnh sửa đồng thời | Revision kiểm tra ngay trong câu lệnh ghi D1 (`write_guard`) → 409; UI tải lại / hợp nhất / giữ bản của tôi | `db/repository.ts`, `db/store.ts`, `EditRecordModal.tsx` |
| Múi giờ VN | Ngày do server đặt theo UTC+7 | `vietnamToday` |
| Test | `tests/business_logic.test.ts` (18 test) | |

Tài liệu: `docs/ops/BUSINESS_RULES.md`. Kiểm thử: typecheck ✔, 273 test ✔, build ✔, wrangler dry-run ✔.

---

## PR04 — Tối ưu giao diện
Nhánh `pr04-ui` → `pr03-business-logic` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/4

| Hạng mục | Đã làm | Tệp chính |
|---|---|---|
| Menu không trùng lặp | Sidebar dựng từ cấu hình `NAV_GROUPS`, mỗi đích đến xuất hiện đúng 1 lần (bỏ mục "Quyết định"/"Chuyên đề" trùng với "Văn bản nội bộ & QĐ"; bỏ nút Đối tác/Thiết lập trùng trên Header). Đủ nhóm: Tổng quan, CV đến, CV đi, Nội bộ/QĐ, HĐ kinh tế, HĐ lao động (theo quyền), Đối tác, **Kho lưu trữ** (mới), Quản trị | `Sidebar.tsx` (520 → 235 dòng), `Header.tsx` |
| Số đếm đúng quyền | Badge tính từ chính danh sách người dùng được xem (bỏ số cứng "27" khi chưa có đối tác) | `App.tsx` (`countFor`) |
| Bộ lọc theo quy trình | CV đi: Dự thảo / Trình ký–Đã ký / Đã phát hành theo giai đoạn quy trình; Kho lưu trữ = văn bản đã lưu trữ + HĐ thanh lý/chấm dứt | `utils/itemFilters.ts`, `services/router.ts` |
| Tách biểu mẫu tạo theo nghiệp vụ | `CreateModal` 2.211 → 366 dòng: `create/useCreateForm.tsx` (state), `ContractForm`, `IncomingForm`, `OutgoingForm`, `constants.ts` | `components/create/` |
| Không điền sẵn dữ liệu mẫu | Bỏ người xử lý/người ký/nơi nhận/vị trí lưu điền sẵn (tên người thật); danh sách nhân sự chỉ lấy từ Thiết lập; thêm lựa chọn "— Chọn —" | `create/constants.ts`, `create/useCreateForm.tsx`, `create/OutgoingForm.tsx` |
| Thông báo lưu | Toast thống nhất (thành công/lỗi/thông tin) thay 18 chỗ `alert()`; xoá chỉ báo thành công khi server xác nhận (API xoá trước đây luôn coi là thành công) | `context/ToastContext.tsx`, `services/api.ts` |
| Responsive | ≤1024px: sidebar thành ngăn kéo (nút ☰); ≤720px: một cột, chi tiết thay danh sách + nút "Quay lại danh sách", KPI cuộn ngang, header gọn | `styles/index.css`, `App.tsx` |
| Giữ sáng/tối & đa ngôn ngữ | Không đổi; mọi chuỗi mới có vi/en/km | i18n |
| Kiểm tra trực quan | Ảnh chụp desktop 1440, tablet 900, phone 390 (dữ liệu giả lập), không lỗi console | `docs/ops/screenshots/` |
| Test | Kiểm tra bộ lọc theo quy trình, Kho lưu trữ, menu không trùng | `tests/item_filters.test.ts` |

Còn lại (chưa tách sâu, chức năng vẫn chạy): `App.tsx` (~690 dòng), `DetailPane.tsx`, `DocumentTableView.tsx`,
`ContractTableView.tsx`, `EditRecordModal.tsx`. Đã thêm các panel tách riêng (tệp đính kèm, lịch sử, quy trình, phụ lục)
thay vì dồn thêm vào các file này.

Kiểm thử: typecheck ✔, 270 test ✔ (6 ca oracle cũ của CV đi được thay bằng test quy trình mới), build ✔, wrangler dry-run ✔.

---

## PR05 — Kiểm thử & chuẩn bị vận hành
Nhánh `pr05-qa-ops` → `pr04-ui` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/5

| Hạng mục | Kết quả |
|---|---|
| Typecheck | ✔ |
| Unit + integration test | ✔ 280 test / 27 file |
| API permission tests | ✔ quét **mọi route API** lấy từ Hono: ẩn danh → 401; người dùng chỉ đọc không gọi được route ghi nào (không 2xx, không 5xx); route quản trị → 403 (`tests/ops_readiness.test.ts`) |
| Security regression | ✔ `access_control`, `security`, `ops_readiness`; giới hạn request 12MB (413) |
| Build | ✔ `vite build` |
| Wrangler dry-run | ✔ bundle không chứa dữ liệu nghiệp vụ (CI kiểm tra) |
| Kiểm tra dependencies | ✔ nâng `hono`, `zod` (v4), `vite`; còn `xlsx` (không có bản sửa, chỉ chạy phía client) — `docs/ops/DEPENDENCIES.md`; CI có bước audit |
| Nhiều người cùng thao tác | ✔ 10 sửa song song khác hồ sơ đều lưu; 6 sửa song song cùng hồ sơ → đúng 1 thành công, 5 nhận 409; 8 CV đi tạo song song → 8 số khác nhau; 2 isolate ghi trùng → guard D1 huỷ bản cũ |
| Nhập Excel | ✔ xem trước/xác nhận/từ chối file lỗi/nhật ký (`business_logic`) |
| Upload, sửa, xoá, khôi phục | ✔ vòng đời end-to-end: tiếp nhận + tệp → thay phiên bản → phân công → hoàn thành → lưu trữ → xoá → khôi phục, đủ lịch sử |
| Múi giờ Việt Nam | ✔ ngày do server đặt theo UTC+7 |
| Backup & restore | ✔ xuất SQL → phục hồi DB trống → so khớp toàn bộ (`backup_restore`) |
| Nhiều kích thước màn hình | ✔ ảnh chụp 1440 / 900 / 390px, không lỗi console (`docs/ops/screenshots/`) |
| Smoke test E2E (server local, dữ liệu giả lập, `--write`) | ✔ 72/72 sau khi sửa |

**Lỗi thật phát hiện và đã sửa trong PR05**
1. Form sửa gửi lại cả bản ghi (kèm `directive_log`, `allowed_transitions` do server sinh) → bị validation từ chối
   (400). Đã loại các trường do server quản lý khỏi body + thêm test vòng lặp GET → PATCH.
2. Hợp đồng tạo qua JSON không có `status` → không thanh lý được. Mặc định `active`; bản ghi cũ thiếu trạng thái coi là hiệu lực.
3. Tải tệp ở chế độ local trả tên tệp lưu trữ thay vì tên gốc → dùng tên gốc từ `file_uploads`.
4. Smoke test dùng ngày cố định (đã quá hạn) và chính sách mật khẩu cũ → cập nhật.

Thêm: `npm run check`, `npm run smoke`, `npm run dev:demo`, `npm run audit:prod`; runbook `docs/ops/DEPLOY_RUNBOOK.md`.

---

## Tổng kết

| PR | Nội dung | Link |
|---|---|---|
| PR01 | Bảo mật & phân quyền | https://github.com/Xichlo1234/bpnm-doc-hub/pull/1 |
| PR02 | Lưu trữ D1/R2 | https://github.com/Xichlo1234/bpnm-doc-hub/pull/2 |
| PR03 | Logic nghiệp vụ | https://github.com/Xichlo1234/bpnm-doc-hub/pull/3 |
| PR04 | Giao diện | https://github.com/Xichlo1234/bpnm-doc-hub/pull/4 |
| PR05 | Kiểm thử & vận hành | https://github.com/Xichlo1234/bpnm-doc-hub/pull/5 |
| PR06 | Khắc phục sau thẩm định | https://github.com/Xichlo1234/bpnm-doc-hub/pull/6 |
| PR07 | Gia cố cuối sau thẩm định lần 2 | https://github.com/Xichlo1234/bpnm-doc-hub/pull/7 |
| PR08 | Khắc phục NO-GO lần 3 (D1–D5) | https://github.com/Xichlo1234/bpnm-doc-hub/pull/8 |
| PR09 | Ổn định toàn diện (E1–E7) | https://github.com/Xichlo1234/bpnm-doc-hub/pull/9 |

Thứ tự merge: PR01 → PR02 → PR03 → PR04 → PR05 → PR06 → PR07 → PR08 → PR09 (xếp chồng). Nhánh `claude/vigilant-babbage-xm8dcm` = toàn bộ.

---

## PR06 — Khắc phục sau thẩm định (review NO-GO trên `93440f3`)
Nhánh `pr06-review-fixes` → `pr05-qa-ops` · mã sửa: commit `1394384` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/6

| Lỗi | Đã sửa | Kiểm thử (tests/review_fixes.test.ts trừ khi ghi khác) |
|---|---|---|
| **B1** Lộ thông báo văn bản Mật khi hồ sơ bị xoá mềm | Thông báo chỉ hiện cho đúng người nhận **và** khi người đó còn đọc được hồ sơ đích ngay lúc xem; hồ sơ trong thùng rác/đã xoá vĩnh viễn → chỉ admin; thông báo cũ không có người nhận → chỉ admin; gán người nhận cho thông báo cũ chỉ khi khớp **duy nhất** một tài khoản (`POST /api/notifications/assign-legacy`, mặc định chạy thử) | ẩn khi chuyển Mật / xoá mềm / xoá vĩnh viễn; thu hồi quyền HĐLĐ; thông báo cũ; gán người nhận (trùng tên không gán) |
| **B2** Quyền tải tệp R2 sau xoá mềm/gỡ tệp | Quyền đọc tệp dựa trên tham chiếu **đang hiệu lực**; tệp chỉ còn tham chiếu cũ (hồ sơ trong thùng rác, tệp đã gỡ) → chỉ admin, người upload **không** lấy lại quyền; tệp mới upload chưa gắn → chỉ người upload/admin; không gắn lại tệp đã gỡ | xoá mềm → 403, khôi phục → 200; gỡ tệp; thay phiên bản; thu hồi quyền; xoá vĩnh viễn không xoá tệp hồ sơ khác dùng |
| **B3** Trùng số khi nhiều người thao tác | Migration **0008** `number_registry` (khoá chính theo sổ + số chuẩn hoá) kiểm tra trong cùng batch ghi D1 (`number_guard`) → nhiều isolate không thể ghi trùng; áp dụng cho số tự động, số tay, đổi số, nhập Excel; số của hồ sơ trong thùng rác không cấp lại; số trùng lịch sử được ghi nhận (hồ sơ cũ nhất giữ số), báo cáo, vẫn sửa được; năm cấp số theo giờ Việt Nam | 2 kết nối SQLite độc lập cùng số tay → lần ghi thứ 2 bị huỷ; đổi số hợp đồng sang số isolate khác vừa dùng; backfill dữ liệu trùng; không cấp lại số trong thùng rác; năm VN |
| **B4** Bỏ qua quy trình qua PATCH/PUT | Một bộ quy tắc duy nhất (`planStatusChange`) cho PATCH, PUT, `/transition` và khi tạo mới: không nhảy bước, trạng thái lạ bị từ chối (`STATUS_INVALID`, không tự đổi thành bước đầu), bắt buộc người xử lý/người ký/số; ngoại lệ chỉ khi có `status_override_reason`, ghi lịch sử `status_override` + audit; trạng thái cũ vẫn đọc được | nhảy Dự thảo → Phát hành bị chặn; trạng thái lạ; thiếu người ký/người xử lý; ngoại lệ có lý do; trạng thái lịch sử |
| **B5** Bỏ qua chống ghi đè khi thiếu revision | `expected_revision` **bắt buộc** (428 `REVISION_REQUIRED`) cho mọi thay đổi hồ sơ: sửa, chuyển bước, phụ lục, liên kết, thanh lý/chấm dứt, tệp đính kèm, liên kết Drive; vẫn kiểm tra lại trong batch D1 (`write_guard`) → 409; client luôn gửi phiên bản đã tải | 10 endpoint thiếu revision → 428; revision cũ → 409 và dữ liệu không đổi; 2 isolate sửa cùng hồ sơ |
| **B6** Thống kê lộ văn bản Mật | `/api/stats` tính trên đúng tập hồ sơ người dùng được đọc (văn bản Mật, HĐLĐ) | số liệu khớp danh sách theo từng tổ hợp quyền |
| Nhật ký nhập Excel | Ghi `import_batches` trong **cùng transaction** với dữ liệu nhập | nhập lỗi (trùng số ở D1) → 409, không có dòng nhật ký |
| Rollback upload | Xoá object R2 rồi xoá bản ghi `file_uploads`; nếu xoá object lỗi thì giữ bản ghi để đối soát | rollback không để lại `file_uploads` |
| HĐ `status = NULL` | Coi là đang hiệu lực ở mọi nơi (thống kê giá trị, thanh lý/chấm dứt) | thống kê + thanh lý |
| Nhập Excel vượt quy tắc | Không đổi số, loại văn bản, trạng thái, độ mật, văn bản đã phát hành; không dùng số trong thùng rác; trạng thái phải hợp lệ | xem trước báo lỗi từng dòng |
| Hồ sơ đã xoá | Lịch sử, tệp đính kèm của hồ sơ trong thùng rác chỉ admin | 404 cho người dùng thường |

**Migration & chuẩn bị Production**
- `scripts/preflight.mjs` (+ `npm run preflight:remote`): **chỉ đọc** (chặn mọi lệnh không phải SELECT/PRAGMA) — ledger `d1_migrations`,
  bảng/cột khớp ledger, dữ liệu cũ (revision NULL, HĐ không trạng thái, thông báo chưa có người nhận, file_key cũ), số trùng.
- `tests/migrations.test.ts`: database giống Production (chỉ 0001–0003 + dữ liệu biên) → preflight không ghi gì → áp 0004–0008 →
  dữ liệu cũ không đổi → ứng dụng khởi động, đăng ký số, sửa được hồ sơ cũ → mã bản trước (SQL thời 0003) vẫn ghi được (rollback).
- Runbook viết lại: SHA triển khai, preflight trước/sau, sao lưu D1+R2, diễn tập phục hồi, tiêu chí dừng, rollback;
  phân biệt smoke chỉ đọc (không tài khoản) với smoke có đăng nhập (ghi audit/phiên); phục hồi R2 không dùng `rclone sync`.

**Kiểm thử thực tế sau sửa (trên commit `1394384`)**
| Lệnh | Kết quả |
|---|---|
| `npm ci` | ✔ |
| `npm run typecheck` | ✔ |
| `npm test` | ✔ 310 test / 29 file |
| `npm run build` | ✔ |
| `npx wrangler deploy --dry-run --outdir dist/worker` | ✔ |
| `npm run audit:prod` | ✔ 0 lỗ hổng |
| `npm run check` | ✔ |
| Smoke E2E `--write` trên server **local** (dữ liệu giả lập) | ✔ 72/72 |
| Luồng giao diện (Playwright: sửa hồ sơ, chuyển bước) | ✔ không có lỗi API |

Chưa kiểm thử trên Production (không được phép). Preflight chưa chạy với D1 Production (cần phê duyệt đọc dữ liệu thật).

---

## PR07 — Gia cố cuối sau thẩm định lần 2 (NO-GO trên PR #6)
Nhánh `pr07-final-hardening` → `pr06-review-fixes` · mã sửa: commit `9f7f41c` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/7

| Lỗi | Đã sửa | Test (`tests/final_hardening.test.ts`) |
|---|---|---|
| **C1** Người upload tải lại tệp đã gỡ/xoá vĩnh viễn | Tombstone `storage_cleanup` + `file_uploads.attached_at` (ghi trong batch khi tệp được gắn lần đầu). Quy tắc "tệp riêng của người upload" chỉ áp dụng cho tệp **chưa từng** gắn; tệp chờ xoá/đã xoá chỉ admin, kể cả khi xoá R2 thất bại | xoá vĩnh viễn + R2 lỗi → người upload 403, không gắn lại được (kể cả admin), thử lại thành công; tham chiếu biến mất không tombstone vẫn 403 |
| **C2** Xung đột D1 khi xoá/khôi phục/cập nhật/tạo lại | Revision kiểm tra trong batch cho **mọi** ghi của văn bản, hợp đồng, đối tác, tài khoản, phiên bản tệp — gồm cả xoá và hàng đã bị worker khác xoá (không "hồi sinh"); upsert theo khoá chính (bỏ `INSERT OR REPLACE` vốn xoá ngầm hàng trùng UNIQUE); cấu hình (danh mục, cài đặt, tiền tệ) kiểm tra theo nội dung đã đọc; khôi phục đối tác trùng mã → 409 | 2 worker: xoá vĩnh viễn vs khôi phục, khôi phục vs xoá vĩnh viễn, sửa đối tác, tạo cùng mã đối tác, sửa cài đặt |
| **C3** Ghi đè quyền, khoá, mật khẩu, phiên | Cột `users.revision`; admin sửa/xoá tài khoản bắt buộc `expected_revision` (428/409); tên đăng nhập duy nhất (không phân biệt hoa thường) ở D1; đăng nhập tự thử lại 1 lần khi tài khoản vừa bị sửa (không ghi đè khoá/đặt lại mật khẩu) | 2 worker: khoá vs cấp quyền, đặt lại mật khẩu vs đổi mật khẩu; trùng tên đăng nhập; thiếu/cũ revision; khoá từ worker khác cắt phiên ngay |
| **C4** Thay/xoá phiên bản tệp đồng thời | Mọi thay đổi tệp đính kèm nâng revision hồ sơ cha; hàng `attachments` có revision riêng | 2 worker cùng thay một tệp → chỉ 1 bản "hiện hành"; gỡ vs thay; API nâng revision |
| **C5** Tái sử dụng số đã cấp | Sổ số **không bao giờ giải phóng**: đổi số, xoá mềm, xoá vĩnh viễn đều giữ số; kiểm tra cả trong bộ nhớ (sổ số nạp từ D1) và trong batch D1; nhập Excel cũng kiểm tra | đổi số rồi tạo lại số cũ → 409 (hồ sơ được quay về số cũ của chính nó); sau xoá vĩnh viễn; worker chưa thấy việc đổi số → D1 chặn |
| **C6** Xoá nhầm object R2 đang dùng | Xoá hai pha: xoá hồ sơ chỉ xếp hàng (cùng transaction) → dọn dẹp hỏi lại D1 trước khi xoá object; còn tham chiếu → `kept`; lỗi → ghi `attempts/last_error`, thử lại `POST /api/admin/storage-cleanup`; `file_guard` chặn gắn tệp đang chờ xoá | tham chiếu do worker khác thêm → giữ object, không gọi xoá; lỗi được ghi nhận; D1 chặn gắn tệp chờ xoá |
| **C7** Rollback Production | Chính sách: không rollback dưới mốc an toàn; `MAINTENANCE_MODE=1` (503 cho API, health vẫn chạy) thay cho rollback mã cũ; `POST /api/admin/number-registry/reconcile` (chạy thử/`apply=1`, chỉ thêm, không gán lại); preflight báo số chưa đăng ký, tệp chờ xoá, tên đăng nhập trùng (chặn 0009) | chế độ bảo trì; bản cũ ghi hồ sơ không đăng ký số → preflight phát hiện → reconcile đăng ký, số trùng giữ chủ cũ; preflight chặn 0009 khi trùng tên |
| Thêm | Nút khoá/mở khoá đối tác gọi endpoint không tồn tại → PATCH có revision; smoke test cập nhật | kiểm tra giao diện Playwright |

**Migration 0009** (chỉ thêm): `partners/users/attachments.revision`, `file_uploads.attached_at` (điền cho tệp đã gắn),
bảng `storage_cleanup`, `file_guard`, chỉ mục duy nhất `users(username COLLATE NOCASE)`.

**Kiểm thử thực tế (commit `9f7f41c`)**
| Lệnh | Kết quả |
|---|---|
| `npm ci` | ✔ |
| `npm run typecheck` | ✔ |
| `npm test` | ✔ 333 test / 30 file |
| `npm run build` | ✔ |
| `npx wrangler deploy --dry-run --outdir dist/worker` | ✔ |
| `npm run audit:prod` | ✔ 0 lỗ hổng |
| `npm run check` | ✔ |
| Smoke E2E `--write` trên server **local** (dữ liệu giả lập) | ✔ 72/72 |
| Playwright: sửa hồ sơ, chuyển bước, bật/tắt quyền người dùng, khoá đối tác | ✔ không lỗi API |

Không chạy gì trên Production. Ghi chú: các mục "Nên sửa" của báo cáo lần 2 không có trong yêu cầu gửi kèm;
đã xử lý các điểm suy ra từ C1–C7 (cấu hình đồng thời, trùng tên đăng nhập, khôi phục đối tác trùng mã,
nút khoá đối tác). Cần bản báo cáo đầy đủ để đối chiếu từng mục.

---

## PR08 — Khắc phục NO-GO lần 3 (D1–D5)
Nhánh `pr08-final-review-fixes` → `pr07-final-hardening` · mã sửa: commit `2a0e908` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/8

| Lỗi | Mã đã sửa | Test (`tests/pr08_hardening.test.ts` trừ khi ghi khác) | Kết quả |
|---|---|---|---|
| **D1** Trùng mã đối tác giữa các worker | `migrations/0010` (UNIQUE `upper(trim(code))` cho đối tác chưa xoá); `routes/partners.ts` (`normalizePartnerCode`, kiểm tra tạo/sửa); `routes/trash.ts` (khôi phục); `db/repository.ts` (`PartnerCodeTakenError`); `index.ts` → 409 `PARTNER_CODE_TAKEN`; id đối tác ngẫu nhiên; preflight chặn `duplicate_partner_codes` | › D1: 2 worker tạo/tạo, tạo/khôi phục, khôi phục/khôi phục; API 409; `migrations.test.ts` › 0010 (dữ liệu lịch sử trùng → preflight chặn, migration không sửa dòng nào, sau khi sửa thì áp được) | ✔ |
| **D2** Đăng nhập cấp token từ lần xác thực trước khi nạp lại | `routes/auth.ts`: vòng lặp tối đa 2 lần; mỗi lần xác thực lại mật khẩu, trạng thái, phiên trên dữ liệu mới; `RevisionConflictError` → `sync` rồi xác thực lại từ đầu; hết lượt → 409 `LOGIN_RETRY`, không token. Giữ nâng cấp hash cũ và bắt buộc đổi mật khẩu mặc định | › D2: đăng nhập vs đặt lại mật khẩu (401, mật khẩu mới dùng được), vs khoá (403), vs thu hồi phiên (token mang `token_version` mới nhất, vẫn nâng cấp hash); mật khẩu mặc định | ✔ |
| **D3** Đua trong cùng isolate | Kiểm tra lại revision/số **sau mọi `await`** (upload R2, kiểm tra quyền tệp, băm mật khẩu) ngay trước khi sửa MemoryStore: `routes/attachments.ts`, `contracts.ts`, `documents.ts`, `users.ts`; thua → `rollback()` tệp vừa upload + 409; `store.persistAsync` ném `RevisionConflictError` nếu bộ đệm bị huỷ (không báo thành công giả) | › D3: 2 request đồng thời (chèn trễ tại `await`) — tệp đính kèm, sửa hợp đồng lao động, đặt lại mật khẩu, tạo văn bản cùng số kèm tệp → 1 thành công + 1 lỗi 409, không còn tệp/hàng `file_uploads` thừa; lỗi commit sau upload → không lộ tệp, không xoá tệp dùng chung | ✔ |
| **D4** Nhập Excel nhận sai văn bản | `utils/importer.ts` `matchRow`: theo id hợp lệ (sai sổ → lỗi) hoặc `(doc_type, số chuẩn hoá)`; thiếu `doc_type` mà số có ở nhiều sổ → lỗi rõ; `db/store.ts` `bulkUpsertDocuments` khớp theo cùng quy tắc; kiểm tra số theo sổ số | › D4: cùng số ở sổ đến/đi — xem trước và ghi chỉ cập nhật đúng sổ; dòng mơ hồ → lỗi (xem trước) và 400 (ghi); dòng sổ khác → tạo mới, không gộp; id khác sổ → lỗi | ✔ |
| **D5** Khoá ghi trước migration | `docs/ops/DEPLOY_RUNBOOK.md` viết lại thành 7 bước (deploy bản mới ở bảo trì → chờ ghi dừng (`data_version` đứng yên) → sao lưu + diễn tập phục hồi → migrate theo thứ tự từ đúng SHA → kiểm tra toàn vẹn → mở ghi → sự cố: giữ bảo trì/sửa tiến); `wrangler.jsonc` `vars.MAINTENANCE_MODE = "0"`; ghi rõ ảnh hưởng tới route/binding/secret/assets | › D5: bảo trì trả 503 **không gọi** `getDatabase`, health vẫn 200; runbook khoá ghi trước lệnh migrate và chỉ mở sau đó; dry-run có/không `--var MAINTENANCE_MODE:1` cùng bộ binding | ✔ |
| Nên sửa: luồng nghiệp vụ | `utils/documentRules.ts`: đổi người xử lý/người ký/loại văn bản mà không đổi trạng thái vẫn kiểm tra yêu cầu của bước hiện tại và tính hợp lệ của trạng thái với loại mới | › Should-fix: xoá người xử lý ở "Đã phân công" → `TRANSITION_FIELD_REQUIRED`; đổi loại → `STATUS_INVALID` | ✔ |
| Nên sửa: Excel giữ trường | Xuất → nhập lại không thay đổi gì; cột mở rộng được giữ; dòng thiếu cột không làm rỗng trường khác | › D4 round trip | ✔ |
| Nên sửa: revision trả về | API sửa tài khoản/đối tác trả revision đã commit (trùng D1) | › Should-fix | ✔ |
| Nên sửa: tồn đọng `storage_cleanup` | `utils/storageCleanup.ts` `cleanupCounts`, `listCleanup(limit, offset)`; `GET /api/admin/storage-cleanup?status&limit&offset`; POST trả `remaining` | › Should-fix: tổng số + phân trang | ✔ |
| Nên sửa: preflight sổ số | `scripts/lib/preflight-core.mjs`: số trùng lịch sử → cảnh báo; `registry_conflicts` (số đã đăng ký cho hồ sơ khác, phát sinh sau backfill) → **CHẶN**; `unregistered_numbers` → cảnh báo + reconcile | › Should-fix: lịch sử không chặn, bản cũ ghi trùng sau backfill → chặn | ✔ |
| Nên sửa: hồi quy | Văn bản Mật, R2, đính kèm, nhật ký, thông báo, sổ số: toàn bộ test cũ vẫn chạy | 359 test | ✔ |

**Lỗi mới phát hiện khi làm PR08 (đã sửa)**
| Lỗi | Xử lý |
|---|---|
| `flush` ghi upsert trước delete → khi một hàng bị xoá và hàng khác lấy lại cùng mã trong một batch, chỉ mục UNIQUE báo lỗi giả | Phát lệnh xoá trước upsert trong batch (`db/store.ts`) |
| `persistAsync` có thể trả thành công khi bộ đệm đã bị huỷ do xung đột | Ném `RevisionConflictError` nếu `stale` sau `flush` |
| Id đối tác suy ra từ mã → tạo lại mã đã xoá vĩnh viễn va chạm id cũ | Id ngẫu nhiên `partner-<slug>-<rand>`; test C2 cập nhật kỳ vọng sang `PartnerCodeTakenError` |
| Một số thao tác (xoá/khôi phục đối tác, gỡ phiên bản tệp) chỉ dựa vào tự nâng revision trong `flush` | Mỗi mutator nâng revision rõ ràng |
| Smoke/test cũ kỳ vọng 400 khi trùng mã đối tác | Đổi sang 409 (đúng đặc tả mới), không nới kiểm tra |
| D2 trong cùng isolate: nhánh không cần ghi không kiểm tra lại mật khẩu/trạng thái sau `await verifyPassword` | Kiểm tra lại trên bản hiện tại trước khi cấp token (commit `2a0e908`); test thất bại trên mã cũ, đạt trên mã mới |

**Migration 0010** (chỉ thêm, không sửa dòng nào): `CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_code_active ON partners (upper(trim(code))) WHERE deleted_at IS NULL`.
Tương thích 0001–0003; không sửa 0001–0009. Preflight chặn trước nếu dữ liệu đang có mã trùng; diễn tập trên DB giả lập Production trong `tests/migrations.test.ts`.

**Kiểm thử thực tế (commit `2a0e908`)**
| Lệnh | Kết quả |
|---|---|
| `npm ci` | ✔ |
| `npm run typecheck` | ✔ |
| `npm test` | ✔ 359 test / 31 file |
| `npm run build` | ✔ |
| `npx wrangler deploy --dry-run --outdir dist/worker` | ✔ (`MAINTENANCE_MODE: "0"`) |
| `npm run audit:prod` | ✔ 0 lỗ hổng |
| `npm run check` | ✔ |
| Smoke E2E `--write` trên server **local** (dữ liệu giả lập) | ✔ 72/72 |
| Playwright: sửa hồ sơ, chuyển bước, quyền người dùng, khoá đối tác | ✔ không lỗi API |

Không chạy gì trên Production, không merge PR nào.

---

## PR09 — Ổn định toàn diện (NO-GO lần 4 trên `2a0e908`, E1–E7)
Nhánh `pr09-stabilization` → `pr08-final-review-fixes` · https://github.com/Xichlo1234/bpnm-doc-hub/pull/9

### Lỗi → nguyên nhân → file sửa → test → kết quả
| Lỗi | Nguyên nhân | File sửa | Test (`tests/pr09_stabilization.test.ts`) | Kết quả |
|---|---|---|---|---|
| **E1** Đổi mật khẩu ghi đè reset/khoá/thu hồi của admin | Tài khoản đọc trước `await verifyPassword/hashPassword`; `token_version` tính từ bản đã đọc | `routes/auth.ts` (kiểm tra lại mật khẩu, trạng thái, revision, token_version sau các `await`; `token_version` lấy từ bản hiện tại; D1 kiểm revision trong batch → 409); E2 tuần tự hoá request ghi trong isolate | › E1: worker khác reset / khoá / thu hồi phiên trong lúc băm → 409, D1 giữ thay đổi của admin; cùng isolate: reset chờ sau đổi mật khẩu → 409; khoá trước → phiên cũ 401 | ✔ |
| **E2** Request B commit thay đổi dở dang của request A | Một `MemoryStore` dùng chung cho mọi request trong isolate; `flush` của B (hoặc `sync` đầu request) ghi mọi khác biệt, kể cả của A | `db/store.ts`: `runRequest` — request **ghi** chạy tuần tự trong isolate trên **bản sao riêng** (`fork`), commit một batch, chỉ thay bộ đệm chung khi commit xong và không còn thay đổi chưa ghi; request **đọc** đọc bộ đệm đã commit; lỗi/4xx/5xx → bỏ bản sao. `store` là proxy theo request (AsyncLocalStorage, chạy được trên workerd). GET danh sách tệp cũ không còn ghi ngầm | › E2: A dừng sau khi sửa bản nháp → GET của B không thấy, D1 không có, PATCH của B chờ; A thành công/thất bại → không rò rỉ, không mất/thừa audit | ✔ |
| **E3** Health trong bảo trì phụ thuộc schema | Middleware DB chạy cả cho `/api/health` | `index.ts`: health bỏ qua DB; bảo trì trả 503 trước DB | › E3: isolate mới trên DB chỉ có 0001–0003: health 200, API 503, **không gọi** `prepare`, không đổi dữ liệu/ledger | ✔ |
| **E4** D1 commit thành công nhưng báo xung đột và xoá tệp R2 | `concurrentWrite` (worker khác cũng ghi) bị coi là `stale` → `persistAsync` ném 409 → route xoá tệp đã được tham chiếu | `db/store.ts` (3 trạng thái: đã commit / bị từ chối / **không xác định** → `CommitOutcomeUnknownError` 503 `COMMIT_UNKNOWN`; commit thành công cần nạp lại = `reloadNeeded`, vẫn là thành công); `utils/recordRequest.ts` (không xoá khi không xác định); `utils/fileStorage.ts` `discardUpload` chỉ xoá khi D1 **xác nhận** không có tham chiếu | › E4: worker khác ghi bản ghi độc lập xen giữa → 201, tệp còn; timeout sau commit → 503, tệp còn và hiển thị sau nạp lại; timeout trước commit → tệp giữ ở trạng thái chưa gắn (chỉ người tải thấy); batch thử lại báo xung đột sau khi đã commit → tệp vẫn giữ; từ chối thật → xoá tệp; R2 xoá lỗi → giữ bản đăng ký; R2 tải lên lỗi → không tạo hồ sơ | ✔ |
| **E5** Trùng mã đối tác Unicode | `upper()` của SQLite chỉ in hoa ASCII | `src/shared/partnerCodeKey.mjs` (một định nghĩa dùng chung: NFKC, bỏ mọi khoảng trắng/ký tự vô hình, in hoa) cho ứng dụng, preflight và D1; `migrations/0011` (`code_key` + UNIQUE cho đối tác chưa xoá); `db/store.ts` điền `code_key` khi khởi động, **bỏ trống** cho mã trùng lịch sử (không đổi mã); preflight **CHẶN** nhóm trùng | › E5: `đt`/`ĐT`, khoảng trắng, NFD/NFC, full-width, ký tự vô hình; API 409; 2 worker `đt-9`/`ĐT-9` → D1 từ chối; dữ liệu lịch sử trùng: 0011 áp được, preflight chặn, mã giữ nguyên, cả hai vẫn sửa được | ✔ |
| **E6** Nhập Excel mất/ghép nhầm dữ liệu | (a) id không tồn tại rơi về khớp theo số; (b) commit tự khớp lại theo số khác với preview; (c) tạo văn bản bỏ cột mở rộng; (d) không phát hiện preview cũ; (e) **giao diện** điền giá trị mặc định cho cột thiếu (ghi đè khi cập nhật), nhận cột chứa chữ "id" là cột id, mặc định sổ "đến" | `utils/importer.ts` (id không tồn tại/đã xoá → lỗi; `preview_token`); `routes/imports.ts` (token sai → 409 `IMPORT_PREVIEW_STALE`; cập nhật bắt buộc token); `db/store.ts` `bulkUpsert*` làm đúng quyết định của preview, không khớp theo số, giữ cột mở rộng; `client/utils/importRows.ts` (khớp đúng tên cột, ô trống không gửi, giữ cột mở rộng, sổ chỉ gửi khi file ghi rõ) | › E6: id sai + số trùng → lỗi, không ghi; cột mở rộng khi tạo VB/HĐ; preview cũ → 409; 2 admin nhập cùng lúc → 1 thành công + 1 409; trùng lịch sử cùng sổ; bộ phân tích phía giao diện | ✔ |
| **E7** Runbook dựa vào chờ thời gian | Deploy không dừng request đang chạy trên bản cũ; `data_version` đứng yên không phải bằng chứng | `scripts/write-fence.mjs` + `scripts/lib/write-fence-core.mjs`: **rào chắn ghi trong D1** (trigger `RAISE(ABORT)` trên 13 bảng bản cũ ghi), `verify` thử ghi thật và phải bị từ chối; preflight báo rào chắn; `docs/ops/DEPLOY_RUNBOOK.md` viết lại: 10 mục, mỗi bước có PASS/FAIL | › E7: diễn tập trọn quy trình trên DB 0001–0003 (rào chắn chặn mọi ghi kiểu bản cũ, kể cả trong transaction; sao lưu + phục hồi; migrate 0004→0011 khi rào chắn bật; bảo trì; gỡ rào chắn; mở ghi); roll-forward khi migration lỗi giữa chừng; thứ tự runbook | ✔ |

### Lỗi mới phát hiện và đã xử lý
| Lỗi | Phát hiện khi | Xử lý | Test |
|---|---|---|---|
| `wrangler dev --local` (wrangler 3.114) không khởi động: `src/server/index.ts` có named export không phải handler (`MAX_REQUEST_BYTES`, `SECURITY_HEADERS`). Cloudflare thật vẫn chạy được (đã xác minh trên staging), nên chỉ ảnh hưởng diễn tập cục bộ | diễn tập `wrangler dev` | Bỏ `export`; entry chỉ xuất `app` + `default` | › Worker entry |
| GET danh sách tệp đính kèm của hồ sơ cũ ghi ngầm một hàng `attachments` | kiểm tra "request đọc không được đổi bộ đệm" | Trả bản xem với id cố định; hàng được tạo ở lần đổi tệp đầu tiên (cùng id) | storage.test |
| Bản ghi bên ngoài request bị mất khi bộ đệm chung cần nạp lại | thiết kế E2 | `sync` ghi thay đổi bên ngoài trước khi nạp lại (chỉ bỏ khi commit trước đó bị từ chối) | review_fixes |
| `preflight`/`db-migrate` hỏng khi wrangler in thông báo (proxy) trước JSON | diễn tập staging | `parseWranglerJson` | › Worker entry |
| `write-fence verify` đọc lỗi ở stderr, wrangler in ở stdout | diễn tập staging | Đọc cả stdout/stderr | diễn tập |
| Giao diện nhập Excel ghi đè trường bằng giá trị mặc định, bỏ cột mở rộng, nhận nhầm cột id | rà soát E6 | `importRows.ts` | › E6 client parser, UAT |
| Số tiền dạng `1.000.000` thành NaN | test E6 | `parseAmount` | › E6 |

### Migration mới
`0011_partner_code_key.sql`: `ALTER TABLE partners ADD COLUMN code_key TEXT` + `CREATE UNIQUE INDEX idx_partners_code_key_active ON partners(code_key) WHERE deleted_at IS NULL AND code_key IS NOT NULL`.
Không sửa 0001–0010; không đổi dòng nào; chạy được khi rào chắn ghi bật.

### Kiểm thử và diễn tập
| Hạng mục | Kết quả |
|---|---|
| `npm ci`, `typecheck`, `test`, `build`, `audit:prod`, `check`, `wrangler deploy --dry-run` | xem `docs/REVIEW_REQUEST.md` (lần chạy cuối) |
| **Staging cục bộ trên workerd** (`wrangler dev --local`, D1/R2 Miniflare), bắt đầu từ DB chỉ có 0001–0003 + dữ liệu giả lập | bảo trì: health 200, API 503, giao diện 200 · rào chắn `verify` PASS (39 trigger/13 bảng) · export + phục hồi bản sao: số bản ghi khớp · `db-migrate migrate --local` 0004→0011 khi rào chắn bật ✔ · `integrity_check` ok · gỡ rào chắn · mở ghi · **smoke `--write` 72/72** · PATCH đồng thời cùng revision ×3 → `200, 409, 409` · mã đối tác `KH-ĐÔNG`/`kh-đông` → 409; `đt` vs mã cũ `ĐT` → 409 · dòng nhập mơ hồ (cùng số 2 sổ) → lỗi rõ · UAT nhập tệp `.xlsx` thật (cập nhật 1 ô không đổi trường khác, tạo mới giữ cột mở rộng, sổ còn lại không bị đụng) ✔ · Playwright (sửa hồ sơ, chuyển bước, quyền, khoá đối tác) không lỗi API |
| Staging trên Cloudflare | **chưa có** môi trường/thông tin truy cập staging → chưa thực hiện |
| Chi phí bản sao theo request | ~56 ms CPU cho 13.000 hồ sơ (chỉ request ghi) |

Không có thao tác nào trên Production. Không merge PR nào.

---

## Quyết định của chủ dự án (sau PR05)

| # | Vấn đề | Quyết định | Trạng thái |
|---|---|---|---|
| 1 | Dữ liệu thật trong lịch sử git | **A** — viết lại lịch sử để xoá hẳn | Chờ: thực hiện **sau khi** PR01–PR05 được duyệt và merge (viết lại lịch sử làm đổi mã commit của mọi nhánh/PR đang review) |
| 2 | Quyền xem văn bản Mật | **A** — chỉ admin và người được cấp quyền | Đã đúng như mã hiện tại (PR01) |
| 3 | Ý nghĩa tỷ giá | **A** — "1 đơn vị = X đơn vị tiền mặc định" | Đã đúng như mã hiện tại (PR03) |
| 4 | Thư viện Excel | **A** — SheetJS 0.20 từ CDN chính thức | **Xong**: `xlsx` 0.20.3; `npm audit --omit=dev` = 0 lỗ hổng; CI siết mức audit lên high; `npm run check` đạt (280 test) |
| 5 | Migration & deploy Production | Cần **ChatGPT phê duyệt** | Review lần 1: NO-GO → đã khắc phục ở PR06, chờ review lại. Chưa thực hiện Production |

## Danh sách kiểm tra cho người review (ChatGPT)

1. Đọc theo thứ tự PR01 → PR05 (mỗi PR là diff riêng trên PR trước).
2. Chạy: `npm ci && npm run check` (kỳ vọng: 280 test đạt, build + dry-run đạt).
3. Chạy thử: `npm run dev:demo` → đăng nhập `admin` / `AdminTest@2026` (dữ liệu giả lập).
4. Trọng tâm cần soát:
   - Phân quyền: `src/server/utils/access.ts`, `utils/fileAccess.ts`, route sweep trong `tests/ops_readiness.test.ts`.
   - Ghi D1 + chống ghi đè: `src/server/db/store.ts` (`flushUnlocked`), `db/repository.ts` (`revisionGuardStatements`).
   - Migration 0004–0007: chỉ thêm, không sửa dữ liệu cũ.
   - Cấp số: `utils/numbering.ts`; quy trình: `utils/workflow.ts`.
5. Phê duyệt / yêu cầu sửa ngay trên từng PR.

## Danh sách chờ chủ dự án quyết định

1. **Lịch sử git** vẫn chứa dữ liệu thật ở commit đầu (repo đã private). Xoá hẳn cần viết lại lịch sử
   (force-push) — chưa làm.
2. **Quy tắc văn bản Mật**: hiện tại chỉ admin hoặc tài khoản được cấp cờ mới xem được. Nếu muốn
   người xử lý được giao cũng xem được văn bản Mật đó, cần xác nhận.
3. **Deploy & migration Production** (0004–0009): chờ phê duyệt.
4. **Ý nghĩa tỷ giá** trong danh mục tiền tệ: đang hiểu là "1 đơn vị = X đơn vị tiền mặc định". Nếu
   công ty dùng quy ước khác (ví dụ VND/1 USD), cần xác nhận để chỉnh công thức quy đổi.
7. **Tách sâu thêm** `App.tsx`, `DetailPane.tsx`, các bảng dữ liệu và `EditRecordModal.tsx` (chức năng đã ổn, chỉ là dọn mã).
5. **Quy trình công văn**: đã giữ nguyên các giá trị trạng thái đang dùng ("Đã gửi" = phát hành,
   "Đã ký - chờ gửi" = đã ký) và thêm "Đã phân công", "Lưu trữ". Nếu muốn đổi tên hiển thị/giá trị lưu, cần quyết định.
