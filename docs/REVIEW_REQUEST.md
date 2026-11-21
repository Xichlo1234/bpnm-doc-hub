# Yêu cầu thẩm định & phê duyệt — BPNM Doc Hub

**Repository:** `Xichlo1234/bpnm-doc-hub` (private)
**Nhánh tích hợp (toàn bộ thay đổi):** `claude/vigilant-babbage-xm8dcm` — commit `f280d53`
**So với mã gốc:** `main` (`f521c0d`, mã nguồn import ban đầu)
**CI (GitHub Actions):** xanh trên nhánh tích hợp và PR05 (typecheck, 280 test, build, wrangler dry-run, audit phụ thuộc)

## Phạm vi cần duyệt — 5 PR xếp chồng, merge theo thứ tự

| PR | Nhánh | Nội dung | Migration |
|---|---|---|---|
| [#1](https://github.com/Xichlo1234/bpnm-doc-hub/pull/1) | `pr01-security-rbac` → `main` | Phân quyền tập trung, văn bản Mật, bảo mật tệp R2, bắt buộc đổi mật khẩu ở backend, thông báo theo người dùng, header bảo mật, gỡ dữ liệu thật khỏi mã triển khai, CI | 0004, 0005 |
| [#2](https://github.com/Xichlo1234/bpnm-doc-hub/pull/2) | `pr02-storage` → `pr01` | Nhiều tệp/hồ sơ + phiên bản + SHA-256, không tệp mồ côi, thùng rác/khôi phục, lịch sử chỉnh sửa, vị trí hồ sơ giấy, Drive chỉ là liên kết, đối soát D1/R2, sao lưu/phục hồi | 0006 |
| [#3](https://github.com/Xichlo1234/bpnm-doc-hub/pull/3) | `pr03-business-logic` → `pr02` | Quy trình CV đến/đi, cấp số nguyên tử chống trùng, điều chỉnh sau phát hành, vòng đời hợp đồng (phụ lục, gia hạn, chấm dứt, thanh lý), đa tiền tệ, xem trước nhập Excel, kiểm tra revision trong câu lệnh ghi D1 | 0007 |
| [#4](https://github.com/Xichlo1234/bpnm-doc-hub/pull/4) | `pr04-ui` → `pr03` | Menu thống nhất (không trùng), Kho lưu trữ, tách biểu mẫu tạo theo nghiệp vụ, bỏ dữ liệu mẫu điền sẵn, toast, responsive | — |
| [#5](https://github.com/Xichlo1234/bpnm-doc-hub/pull/5) | `pr05-qa-ops` → `pr04` | Quét bảo mật mọi route API, test đồng thời & E2E, sửa 3 lỗi thật, nâng `hono`/`zod`/`vite`, `xlsx` → SheetJS 0.20.3, runbook triển khai | — |

Migration 0004–0007 **chỉ thêm** (CREATE TABLE IF NOT EXISTS / ADD COLUMN), không sửa/xoá dữ liệu cũ.

## Quyết định của chủ dự án đã áp dụng
1. Xoá dữ liệu thật khỏi lịch sử git — **làm sau khi merge** (viết lại lịch sử đổi mã commit của các PR).
2. Văn bản Mật: chỉ admin và người được cấp quyền.
3. Tỷ giá: "1 đơn vị = X đơn vị tiền mặc định".
4. `xlsx` → SheetJS 0.20.3 từ CDN chính thức — **đã làm**, `npm audit --omit=dev` = 0 lỗ hổng.
5. Migration & deploy Production — **chờ phê duyệt** (yêu cầu này).

## Đề nghị người thẩm định kiểm tra
1. `npm ci && npm run check` → kỳ vọng 280 test đạt, build + dry-run đạt.
2. `npm run dev:demo` → đăng nhập `admin` / `AdminTest@2026` (dữ liệu giả lập, không phải dữ liệu thật).
3. Trọng tâm mã nguồn:
   - Phân quyền: `src/server/utils/access.ts`, `src/server/utils/fileAccess.ts`, `tests/ops_readiness.test.ts`.
   - Ghi D1 & chống ghi đè: `src/server/db/store.ts` (`flushUnlocked`), `src/server/db/repository.ts` (`revisionGuardStatements`).
   - Cấp số & quy trình: `src/server/utils/numbering.ts`, `src/server/utils/workflow.ts`.
   - Migration: `migrations/0004…0007`.
4. Quy trình triển khai: `docs/ops/DEPLOY_RUNBOOK.md` (sao lưu → migrate → deploy → kiểm tra chỉ đọc → rollback).

## Rủi ro & tồn tại đã biết
- Lịch sử git còn dữ liệu thật ở commit đầu (sẽ xử lý theo quyết định 1 sau merge).
- Một số component lớn (`App.tsx`, `DetailPane.tsx`, các bảng, `EditRecordModal.tsx`) chưa tách sâu; chức năng không đổi.
- Sau triển khai, tài khoản còn dùng mật khẩu mặc định hoặc mật khẩu do admin đặt sẽ bị yêu cầu đổi mật khẩu; người dùng thường không còn thấy văn bản "Mật" cho tới khi được cấp quyền.
- Phụ thuộc chỉ dùng khi phát triển (wrangler 3, vitest 2…) còn cảnh báo, không đóng gói vào Worker.

## Xin phê duyệt
- [ ] Duyệt merge PR #1 → #5 theo thứ tự.
- [ ] Duyệt chạy migration 0004–0007 trên D1 Production (`npm run db:migrate:remote`, có sao lưu tự động).
- [ ] Duyệt deploy Production theo `docs/ops/DEPLOY_RUNBOOK.md`.
- [ ] Duyệt viết lại lịch sử git để xoá dữ liệu thật (sau merge).

Chi tiết từng hạng mục: `docs/WORKLOG.md`.
