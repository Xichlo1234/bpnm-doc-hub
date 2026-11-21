# Yêu cầu thẩm định lại lần 3 — BPNM Doc Hub

**Repository:** `Xichlo1234/bpnm-doc-hub` (private)
**Lần 1:** `93440f3` → NO-GO (B1–B6) → sửa ở PR #6.
**Lần 2:** PR #6 → NO-GO (C1–C7) → sửa ở **PR #7**.
**Mã sửa lần này:** nhánh `pr07-final-hardening`, commit `9f7f41c1878b04299121ddf13afde1b1cf050754`
(các commit sau chỉ cập nhật tài liệu)
**Nhánh tích hợp (toàn bộ):** `claude/vigilant-babbage-xm8dcm` = đầu nhánh `pr07-final-hardening`
**So với:** `main` (`f521c0d`, mã nguồn import ban đầu)

## Các PR (xếp chồng, merge theo thứ tự; chưa merge PR nào, không force-push)
| PR | Nhánh | Nội dung | Migration |
|---|---|---|---|
| [#1](https://github.com/Xichlo1234/bpnm-doc-hub/pull/1) | `pr01-security-rbac` → `main` | Bảo mật & phân quyền | 0004, 0005 |
| [#2](https://github.com/Xichlo1234/bpnm-doc-hub/pull/2) | `pr02-storage` → `pr01` | Lưu trữ D1/R2 | 0006 |
| [#3](https://github.com/Xichlo1234/bpnm-doc-hub/pull/3) | `pr03-business-logic` → `pr02` | Logic nghiệp vụ | 0007 |
| [#4](https://github.com/Xichlo1234/bpnm-doc-hub/pull/4) | `pr04-ui` → `pr03` | Giao diện | — |
| [#5](https://github.com/Xichlo1234/bpnm-doc-hub/pull/5) | `pr05-qa-ops` → `pr04` | Kiểm thử & vận hành | — |
| [#6](https://github.com/Xichlo1234/bpnm-doc-hub/pull/6) | `pr06-review-fixes` → `pr05` | Khắc phục B1–B6 | 0008 |
| **#7** | `pr07-final-hardening` → `pr06` | **Khắc phục C1–C7** | **0009** |

## Đối chiếu C1–C7 → mã → test
| Lỗi | Tệp chính | Test (`tests/final_hardening.test.ts`) |
|---|---|---|
| C1 tệp đã gỡ/xoá quay lại người upload | `utils/fileAccess.ts`, `utils/storageCleanup.ts`, `db/repository.ts` (`fileUseStatements`), `migrations/0009` | › C1 |
| C2 xoá/khôi phục/cập nhật/tạo lại đa worker | `db/store.ts` (`flushUnlocked`), `db/repository.ts` (`revisionGuardStatements` — đổi/xuất hiện/biến mất, `configGuardStatement`), `db/tables.ts` (`bulkUpsertSql` upsert theo khoá chính), `routes/trash.ts` | › C2 |
| C3 tài khoản | `routes/users.ts`, `routes/auth.ts` (thử lại khi đăng nhập), `migrations/0009` (revision, unique username) | › C3 |
| C4 phiên bản tệp đính kèm | `routes/attachments.ts` (`touchRecord`), revision `attachments` | › C4 |
| C5 tái sử dụng số | `db/store.ts` (`numberClaimsFor`, sổ số không giải phóng), `utils/documentRules.ts`, `utils/contractRules.ts`, `utils/importer.ts` | › C5 |
| C6 xoá nhầm object R2 | `utils/storageCleanup.ts`, `routes/trash.ts`, `routes/admin.ts` (`/storage-cleanup`) | › C6 |
| C7 rollback | `src/server/index.ts` (`MAINTENANCE_MODE`), `routes/admin.ts` (`/number-registry/reconcile`), `scripts/lib/preflight-core.mjs`, `docs/ops/DEPLOY_RUNBOOK.md` mục 6 | › C7 |

## Kết quả kiểm thử thực tế (commit `9f7f41c`)
`npm ci` ✔ · `npm run typecheck` ✔ · `npm test` ✔ **333 test / 30 file** · `npm run build` ✔ ·
`npx wrangler deploy --dry-run --outdir dist/worker` ✔ · `npm run audit:prod` ✔ (0 lỗ hổng) · `npm run check` ✔ ·
smoke E2E có ghi trên server **local** dữ liệu giả lập ✔ 72/72 · Playwright (sửa hồ sơ, chuyển bước, quyền người dùng,
khoá đối tác) ✔. Không có kiểm thử nào trên Production.

## Rủi ro còn lại (đã biết)
- Số trùng trong dữ liệu lịch sử (nếu có) không tự sửa: hồ sơ cũ nhất giữ số, phần còn lại được báo cáo.
- Thông báo cũ chưa có người nhận: chỉ admin thấy cho tới khi chạy `assign-legacy`.
- Bộ nhớ đệm toàn bộ bảng mỗi isolate; danh sách API chưa phân trang (phù hợp quy mô hiện tại).
- Một số component giao diện lớn chưa tách sâu.
- Lịch sử git còn dữ liệu thật ở commit đầu: xử lý sau khi merge (quyết định 1A).
- Bản đầy đủ các mục "Nên sửa" của báo cáo lần 2 chưa được gửi kèm; xem ghi chú trong `docs/WORKLOG.md`.

## Xin phê duyệt
- [ ] PR #1 → #7: merge theo thứ tự.
- [ ] Đọc D1 Production bằng `npm run preflight:remote` (chỉ đọc).
- [ ] Migration 0004–0009 trên D1 Production theo `docs/ops/DEPLOY_RUNBOOK.md`.
- [ ] Deploy Production theo runbook (đúng SHA đã merge; ghi mốc an toàn cho rollback).
- [ ] Viết lại lịch sử git để xoá dữ liệu thật (sau merge).
