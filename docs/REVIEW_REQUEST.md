# Yêu cầu thẩm định lại — BPNM Doc Hub (sau NO-GO)

**Repository:** `Xichlo1234/bpnm-doc-hub` (private)
**Bản đã review lần 1:** `93440f32ff57bf6f5e3e29349248454d0fbfeddb` → kết luận NO-GO (B1–B6)
**Bản sửa lỗi:** nhánh `pr06-review-fixes`, mã sửa tại commit `1394384d46a64ce7b40ceda372fbe12806c566bb`
(commit sau đó chỉ cập nhật tài liệu này và `docs/WORKLOG.md`)
**Nhánh tích hợp (toàn bộ):** `claude/vigilant-babbage-xm8dcm` = đầu nhánh `pr06-review-fixes`
**So với:** `main` (`f521c0d`, mã nguồn import ban đầu)

## Các PR (xếp chồng, merge theo thứ tự, chưa merge PR nào)
| PR | Nhánh | Nội dung |
|---|---|---|
| [#1](https://github.com/Xichlo1234/bpnm-doc-hub/pull/1) | `pr01-security-rbac` → `main` | Bảo mật & phân quyền (migration 0004, 0005) |
| [#2](https://github.com/Xichlo1234/bpnm-doc-hub/pull/2) | `pr02-storage` → `pr01` | Lưu trữ D1/R2 (0006) |
| [#3](https://github.com/Xichlo1234/bpnm-doc-hub/pull/3) | `pr03-business-logic` → `pr02` | Logic nghiệp vụ (0007) |
| [#4](https://github.com/Xichlo1234/bpnm-doc-hub/pull/4) | `pr04-ui` → `pr03` | Giao diện |
| [#5](https://github.com/Xichlo1234/bpnm-doc-hub/pull/5) | `pr05-qa-ops` → `pr04` | Kiểm thử & vận hành |
| **#6** | `pr06-review-fixes` → `pr05` | **Khắc phục B1–B6 + các mục còn lại (0008)** |

PR #1–#5 giữ nguyên (không force-push, không viết lại lịch sử). Mọi sửa lỗi nằm trong PR #6.

## Đối chiếu lỗi chặn → cách sửa → test
| Lỗi | Tệp chính | Test |
|---|---|---|
| B1 thông báo lộ văn bản Mật khi xoá mềm | `src/server/routes/notifications.ts` (`canSeeNotification`) | `tests/review_fixes.test.ts` › B1 |
| B2 quyền tải tệp sau xoá mềm/gỡ tệp | `src/server/utils/fileAccess.ts` (`fileReferences`, `canReadFile`) | › B2 |
| B3 trùng số đa isolate | `migrations/0008_number_registry.sql`, `src/server/db/repository.ts` (`numberGuardStatements`…), `src/server/db/store.ts` (`numberChangesFor`, `ensureNumberRegistry`), `utils/numberKeys.ts` | › B3 (2 kết nối SQLite độc lập) |
| B4 PATCH/PUT bỏ qua quy trình | `src/server/utils/documentRules.ts` (`planStatusChange`), `utils/workflow.ts` (`findStage`, `missingForStage`), `routes/documents.ts` (`applyDocumentChange`) | › B4 |
| B5 thiếu revision | `src/server/utils/validation.ts` (`revisionConflict` → 428/409), các route thay đổi hồ sơ; client `services/api.ts` | › B5 (10 endpoint, 2 isolate) |
| B6 thống kê lộ văn bản Mật | `routes/stats.ts`, `store.getStats(user)` | › B6 |
| Còn lại (import log cùng transaction, rollback upload, HĐ status NULL, nhập Excel, năm VN, hồ sơ đã xoá) | `routes/imports.ts`, `utils/importer.ts`, `utils/fileStorage.ts` (`discardUpload`), `utils/contractRules.ts` | › Other review items |
| Migration & rollback | `scripts/preflight.mjs`, `scripts/lib/preflight-core.mjs` | `tests/migrations.test.ts` |

## Kết quả kiểm thử thực tế (commit `1394384`)
`npm ci` ✔ · `npm run typecheck` ✔ · `npm test` ✔ **310 test / 29 file** · `npm run build` ✔ ·
`npx wrangler deploy --dry-run --outdir dist/worker` ✔ · `npm run audit:prod` ✔ (0 lỗ hổng) · `npm run check` ✔ ·
smoke E2E có ghi trên server **local** dữ liệu giả lập ✔ 72/72 · luồng giao diện Playwright ✔.
Không có kiểm thử nào trên Production.

## Rủi ro còn lại (đã biết)
- Số trùng trong dữ liệu lịch sử Production (nếu có) không tự sửa: hồ sơ cũ nhất giữ số, các hồ sơ khác vẫn sửa được
  nhưng không đổi sang số đang dùng; danh sách do `npm run preflight:remote` và `meta.number_registry_backfill` cung cấp.
- Thông báo cũ chưa có người nhận chỉ admin thấy cho tới khi chạy `assign-legacy` (chỉ gán khi khớp duy nhất).
- Bộ nhớ đệm toàn bộ bảng trong mỗi isolate (thiết kế sẵn có) — phù hợp quy mô hiện tại; danh sách API chưa phân trang.
- Một số component giao diện lớn chưa tách sâu (không ảnh hưởng chức năng).
- Lịch sử git còn dữ liệu thật ở commit đầu: xử lý sau khi merge (quyết định 1A).

## Xin phê duyệt
- [ ] PR #1 → #6: merge theo thứ tự.
- [ ] Đọc D1 Production bằng `npm run preflight:remote` (chỉ đọc).
- [ ] Migration 0004–0008 trên D1 Production theo `docs/ops/DEPLOY_RUNBOOK.md`.
- [ ] Deploy Production theo runbook (đúng SHA đã merge).
- [ ] Viết lại lịch sử git để xoá dữ liệu thật (sau merge).

Chi tiết: `docs/WORKLOG.md` (mục PR06), `docs/ops/DEPLOY_RUNBOOK.md`, `docs/ops/BACKUP_RESTORE.md`.
