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
Nhánh `pr05-qa-ops` → `pr04-ui` · (link PR bên dưới)

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
| PR05 | Kiểm thử & vận hành | (link PR bên dưới) |

Thứ tự merge: PR01 → PR02 → PR03 → PR04 → PR05 (xếp chồng). Nhánh `claude/vigilant-babbage-xm8dcm` = toàn bộ.

---

## Danh sách chờ chủ dự án quyết định

1. **Lịch sử git** vẫn chứa dữ liệu thật ở commit đầu (repo đã private). Xoá hẳn cần viết lại lịch sử
   (force-push) — chưa làm.
2. **Quy tắc văn bản Mật**: hiện tại chỉ admin hoặc tài khoản được cấp cờ mới xem được. Nếu muốn
   người xử lý được giao cũng xem được văn bản Mật đó, cần xác nhận.
3. **Deploy & migration Production** (0004–0007): chờ phê duyệt.
4. **Ý nghĩa tỷ giá** trong danh mục tiền tệ: đang hiểu là "1 đơn vị = X đơn vị tiền mặc định". Nếu
   công ty dùng quy ước khác (ví dụ VND/1 USD), cần xác nhận để chỉnh công thức quy đổi.
6. **Thư viện Excel `xlsx`**: không có bản vá trên npm; đề xuất chuyển SheetJS 0.20 (CDN chính thức) hoặc `exceljs`.
7. **Tách sâu thêm** `App.tsx`, `DetailPane.tsx`, các bảng dữ liệu và `EditRecordModal.tsx` (chức năng đã ổn, chỉ là dọn mã).
5. **Quy trình công văn**: đã giữ nguyên các giá trị trạng thái đang dùng ("Đã gửi" = phát hành,
   "Đã ký - chờ gửi" = đã ký) và thêm "Đã phân công", "Lưu trữ". Nếu muốn đổi tên hiển thị/giá trị lưu, cần quyết định.
