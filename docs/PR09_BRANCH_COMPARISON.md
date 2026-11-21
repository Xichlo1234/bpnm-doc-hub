# So sánh hai nhánh sửa lỗi lần 4 (E1–E7) — để reviewer chọn nhánh gốc

> Người viết là tác giả của nhánh A. Mọi khẳng định dưới đây đều kiểm chứng được bằng lệnh ghi kèm.
> Reviewer xin tự chạy lại và tự đánh giá; đề nghị không dựa vào phần nhận xét của tác giả.

| | **A — `pr09-stabilization`** (Claude Code) | **B — `codex/pr09-stabilization`** (ChatGPT/Codex) |
|---|---|---|
| Commit cuối | `c07ce94` (mã: `cbbc7b5`) | `4bc122a` |
| Tách từ | `964e1df` (đầu PR #8) | `964e1df` (đầu PR #8) |
| Quy mô so với PR #8 | ~51 tệp | 36 tệp, +928/−235 |
| Migration mới | `0011_partner_code_key.sql`: cột `partners.code_key` + chỉ mục UNIQUE một phần | `0011_stabilization.sql`: bảng `request_commits` (biên nhận commit), cột `file_uploads.stored_at`, bảng `partner_code_keys` |

Hai nhánh **không ghép được với nhau**: cùng sửa `store.ts`, `repository.ts`, `auth.ts`, `importer.ts`, runbook, và
đều có một migration số 0011 khác nhau. Phải chọn một.

## 1. Kết quả chạy lại (cùng máy, cùng `node_modules`)
| Lệnh | A | B |
|---|---|---|
| `npx tsc --noEmit -p .` | ✔ | ✔ |
| `npx vitest run` | ✔ 388/388 (32 tệp) | ✔ 375/375 (32 tệp) |
| `npm run build` | ✔ | ✔ |
| Khởi động bằng `wrangler dev --local` (wrangler 3.114) | ✔ | ✘ `Incorrect type for map entry 'MAX_REQUEST_BYTES'` |
| **Chạy trên Cloudflare (staging)** | chưa deploy | ✔ — staging đang chạy đúng `4bc122a` (tệp `assets/index-xFfn6WEy.js` trùng khớp khi build lại) |

**Đính chính:** lỗi ở B chỉ xảy ra với `wrangler dev` cục bộ (wrangler 3.114). Cloudflare thật vẫn chạy được B: đã xác minh
staging chạy commit `4bc122a` và trả `/api/health` 200. Vì vậy đây **không phải lỗi chặn Production**. Nó chỉ cản việc
diễn tập cục bộ. Bỏ hai export `MAX_REQUEST_BYTES` và `SECURITY_HEADERS` (sửa một dòng) giúp diễn tập cục bộ chạy được trên cả hai nhánh.

Tái hiện:
```bash
git worktree add /tmp/b 4bc122a && cd /tmp/b && npm ci && npx vite build
CI=true npx wrangler dev --local --port 8788 --var MAINTENANCE_MODE:1 --var AUTH_SECRET:x   # B: runtime failed to start
```

## 2. Cách tiếp cận từng lỗi
| Lỗi | A | B |
|---|---|---|
| **E2** cô lập request | Request **ghi** chạy tuần tự trong isolate trên **bản sao riêng** (`fork`). Bộ đệm chung chỉ được thay sau khi commit xong. Request **đọc** chạy song song trên dữ liệu đã commit (AsyncLocalStorage; đã chạy trên workerd). Cái giá: sao chép ~56 ms CPU / 13.000 hồ sơ cho mỗi request ghi | Tuần tự hoá **mọi** request (đọc và ghi) trong isolate (`runRequest` với `requestTail`) trên một bộ đệm chung. Bỏ thay đổi khi lỗi (`discardPending` → stale). Đơn giản hơn, không tốn chi phí sao chép, nhưng request đọc phải chờ request ghi chậm (ví dụ upload lớn) |
| **E4** kết quả commit không xác định | Phân 3 trạng thái: thành công (kể cả khi worker khác ghi xen giữa), bị từ chối, không xác định (`503 COMMIT_UNKNOWN`). Không xoá tệp khi không xác định. `discardUpload` chỉ xoá khi D1 xác nhận không còn tham chiếu | **Biên nhận commit** (`request_commits`): khi mất phản hồi D1, đọc lại biên nhận để biết batch đã commit hay chưa, rồi trả kết quả đúng. Thêm `file_uploads.stored_at`: không gắn được tệp khi R2 chưa xác nhận lưu xong. Cách này chủ động đối soát hơn A |
| **E5** mã đối tác Unicode | Cột `code_key` + UNIQUE một phần; khoá dùng chung `src/shared/partnerCodeKey.mjs` (NFKC, bỏ mọi khoảng trắng/ký tự vô hình, in hoa). Mã trùng lịch sử để `NULL`, preflight **chặn** | Bảng `partner_code_keys(code_key PK, partner_id UNIQUE)`, khởi tạo một lần (`partner_code_keys_ready`). Mã trùng lịch sử phải để chủ dự án quyết định |
| **E6** nhập Excel | `preview_token`; id lạ bị từ chối; commit làm đúng quyết định của bước xem trước; giữ cột mở rộng. **Sửa cả phía giao diện**: phía giao diện điền giá trị mặc định cho cột thiếu (ghi đè khi cập nhật) và nhận nhầm cột chứa chữ "id" | `preview_fingerprint`; id lạ bị từ chối; giữ cột mở rộng; preview thứ hai không ghi đè được lần nhập trước. **Cần reviewer kiểm tra** B có sửa lỗi ghi đè bằng giá trị mặc định ở `ExcelManagerModal.tsx` không |
| **E7** khoá ghi | Rào chắn trigger trên **D1 đang dùng**, migrate **tại chỗ** (0004→0011 chạy được khi rào chắn bật). Có `write-fence verify` (thử ghi thật). Đã diễn tập trên workerd + D1 Miniflare: smoke 72/72 | **Cắt chuyển sang D1/R2 mới**: rào chắn D1 nguồn (`cutover-fence.mjs`) + **R2 Bucket Locks**, sao chép sang D1/R2 đích, nâng schema trên đích, rồi chuyển binding. Nguồn được giữ nguyên làm bản dự phòng. An toàn dữ liệu cao hơn nhưng vận hành phức tạp hơn (cần tạo D1/R2 mới, đổi binding); runbook ghi rõ cần chứng minh trên staging |

## 3. Câu hỏi đề nghị reviewer trả lời
1. Với quy mô dữ liệu thực tế, cô lập kiểu A (bản sao + đọc song song) hay kiểu B (tuần tự toàn bộ) phù hợp hơn?
2. Có cần biên nhận commit của B (đối soát chủ động) thay cho "không xác định, giữ tệp" của A không?
3. Triển khai **tại chỗ có rào chắn** (A) hay **cắt chuyển sang D1/R2 mới** (B)?
4. Chọn nhánh gốc nào? Nhánh được chọn nên nhận thêm từ nhánh kia những gì? Ví dụ:
   - B cần: bỏ export ở `index.ts` (để diễn tập cục bộ chạy được); sửa bộ phân tích Excel phía giao diện; `parseWranglerJson`.
   - A cần: biên nhận commit; `stored_at`.

## 4. Sau khi chọn
- Nhánh được chọn → PR #9 (base `pr08-final-review-fixes`). Nhánh còn lại giữ nguyên để tham chiếu, không xoá.
- Phần **giao diện thu gọn** (Sidebar, Header, i18n, CSS) mà ChatGPT đang làm trong `scratch/bpnm-compact-nav`
  sẽ được đẩy lên một nhánh tách từ nhánh được chọn, rồi kiểm tra: typecheck, test i18n/chữ viết cứng, Playwright, staging.
