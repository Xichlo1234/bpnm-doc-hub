# Yêu cầu thẩm định PR09 · Ổn định dữ liệu và cutover

Base `pr08-final-review-fixes` tại `964e1df`. Head `codex/pr09-stabilization`.

Cần xác minh độc lập CAS đổi mật khẩu; vòng đời request; bảo trì trên schema cũ; biên nhận D1 và vòng đời tệp; khóa Unicode; điều kiện cập nhật theo preview; và cutover nguồn sang đích riêng. Bảng ánh xạ lỗi, tệp sửa và test nằm trong [worklog](WORKLOG.md). [Checklist](ops/RELEASE_CHECKLIST.md) ghi các cổng còn thiếu.

368 bài Vitest thực thi đạt, 72/72 smoke local đạt. Hai suite SheetJS và build SPA đang chờ CDN trả được gói đã ghim. UAT staging D1/R2 và kết luận GO còn chờ.

---

## Yêu cầu thẩm định lại lần 4 — BPNM Doc Hub

**Repository:** `Xichlo1234/bpnm-doc-hub` (private)
**Lần 1:** `93440f3` → NO-GO (B1–B6) → PR #6. **Lần 2:** PR #6 → NO-GO (C1–C7) → PR #7.
**Lần 3:** PR #7 → NO-GO (D1–D5) → sửa ở **PR #8**.
**Mã sửa lần này:** nhánh `pr08-final-review-fixes`, commit `2a0e908551af4ce9e4ad76a669e43fe7e911735a`
(các commit sau chỉ cập nhật tài liệu)
**Nhánh tích hợp (toàn bộ):** `claude/vigilant-babbage-xm8dcm` = đầu nhánh `pr08-final-review-fixes`
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
| [#7](https://github.com/Xichlo1234/bpnm-doc-hub/pull/7) | `pr07-final-hardening` → `pr06` | Khắc phục C1–C7 | 0009 |
| [#8](https://github.com/Xichlo1234/bpnm-doc-hub/pull/8) | `pr08-final-review-fixes` → `pr07` | **Khắc phục D1–D5** | **0010** |

## Lỗi → Mã đã sửa → Test → Kết quả
| Lỗi | Mã đã sửa | Test | Kết quả |
|---|---|---|---|
| D1 trùng mã đối tác đa worker | `migrations/0010`, `routes/partners.ts`, `routes/trash.ts`, `db/repository.ts`, `db/store.ts`, `index.ts`, `scripts/lib/preflight-core.mjs` | `pr08_hardening` › D1; `migrations` › 0010 | ✔ |
| D2 đăng nhập dùng xác thực cũ | `routes/auth.ts` | `pr08_hardening` › D2 (đặt lại mật khẩu / khoá / thu hồi phiên) | ✔ |
| D3 đua trong cùng isolate | `routes/attachments.ts`, `contracts.ts`, `documents.ts`, `users.ts`, `db/store.ts` (`persistAsync`) | `pr08_hardening` › D3 (2 request đồng thời, trễ tại `await`; lỗi commit sau upload) | ✔ |
| D4 nhập Excel nhận sai sổ | `utils/importer.ts` (`matchRow`), `db/store.ts` (`bulkUpsertDocuments`) | `pr08_hardening` › D4 (xem trước + ghi; cùng số nhiều sổ; round trip) | ✔ |
| D5 khoá ghi trước migration | `docs/ops/DEPLOY_RUNBOOK.md` (7 bước), `wrangler.jsonc` | `pr08_hardening` › D5 (503 không chạm DB; thứ tự runbook) | ✔ |
| Nên sửa (luồng, Excel, revision, storage_cleanup, preflight, hồi quy) | `utils/documentRules.ts`, `utils/storageCleanup.ts`, `routes/admin.ts`, `scripts/lib/preflight-core.mjs` | `pr08_hardening` › Should-fix + toàn bộ test cũ | ✔ |

Chi tiết từng lỗi, lỗi mới phát hiện và cách xử lý: `docs/WORKLOG.md` › PR08.
Báo cáo tự chứa cho reviewer: `docs/CHATGPT_REVIEW_PR08.md`.

## Kết quả kiểm thử thực tế (commit `2a0e908`)
`npm ci` ✔ · `npm run typecheck` ✔ · `npm test` ✔ **359 test / 31 file** · `npm run build` ✔ ·
`npx wrangler deploy --dry-run --outdir dist/worker` ✔ · `npm run audit:prod` ✔ (0 lỗ hổng) · `npm run check` ✔ ·
smoke E2E có ghi trên server **local** dữ liệu giả lập ✔ 72/72 · Playwright ✔. Không có kiểm thử nào trên Production.

## Rủi ro còn lại (đã biết)
- Mã đối tác trùng có sẵn trong Production (nếu có) chặn 0010: cần chủ dự án quyết định đổi mã/đưa vào thùng rác.
- Thời gian bảo trì ~30 phút (không ghi được từ mục 1 đến 5 của runbook).
- Request rất dài trên Worker cũ có thể vượt khoảng chờ 2 phút: runbook yêu cầu xác nhận `data_version` đứng yên.
- Số trùng lịch sử không tự sửa; thông báo cũ chưa có người nhận chỉ admin thấy tới khi chạy `assign-legacy`.
- Bộ nhớ đệm toàn bộ bảng mỗi isolate; danh sách API chưa phân trang (phù hợp quy mô hiện tại).
- Lịch sử git còn dữ liệu thật ở commit đầu: xử lý sau khi merge (quyết định 1A).

## Xin phê duyệt
- [ ] PR #1 → #8: merge theo thứ tự.
- [ ] Đọc D1 Production bằng `npm run preflight:remote` (chỉ đọc).
- [ ] Khoá ghi + migration 0004–0010 + deploy theo `docs/ops/DEPLOY_RUNBOOK.md` (7 bước, đúng SHA đã merge).
- [ ] Viết lại lịch sử git để xoá dữ liệu thật (sau merge).
