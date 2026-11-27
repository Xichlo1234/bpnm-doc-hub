# Nhật ký phát hành Production: 26–27/11/2026

**Trang:** https://document-manage.tungcv.vn
**Người duyệt và cho phép:** chủ dự án (viettung.cao). Xác nhận bằng văn bản trong phiên làm việc, ngày 27/11/2026.
**Người thực hiện:** Claude Code. Các bước ghi lên Cloudflare do chủ dự án chạy trên máy của mình (xem mục 6).
**Trạng thái:** đang chạy. Chưa merge PR nào vào `main`.

---

## 1. Hạ tầng Production thực tế

Lưu ý: `wrangler.jsonc` trong repo trỏ tới `bpnm.tungcv.vn` và Worker `bpnm-doc-hub`. **Đó không phải Production.**

| Thành phần | Giá trị |
|---|---|
| Tài khoản Cloudflare | `Viettung.cao@gmail.com's Account` (`cc8e2a546317d0e17f696b246a8f69b9`) |
| Tên miền | `document-manage.tungcv.vn` (custom domain) |
| Worker | `quan-ly-cong-van` |
| D1 | `document-manager-db` (`dd6a5309-85ff-449b-bdbd-b1aa239dcb77`) |
| R2 | `document-manager-files` |
| Secret | `AUTH_SECRET`: giữ nguyên, không đổi |
| Cấu hình deploy | `Xichlo1234/bpnm-doc-hub-staging-src` › `deploy/wrangler.production.jsonc` (commit `2bbe9dd`) |

Staging nằm ở tài khoản khác: `viettungcao2` (`b1f76d06b3e7f940c7d187d2e383cc05`). Worker là `bpnm-doc-hub-staging`, D1 là `2606b1fb-…`, R2 là `bpnm-doc-hub-staging-target`.

## 2. Trước khi làm (26/11), kiểm tra chỉ đọc

- Bản Worker cũ: deploy ngày 20/11, version `016b2f7a`.
- D1 đã áp 0001–0003. Dữ liệu: 4 văn bản, 74 hợp đồng, 27 đối tác, 3 tài khoản, 15 thông báo, 117 dòng nhật ký.
- Preflight chỉ đọc: không có lỗi chặn, không có mã đối tác trùng, không có số trùng.

## 3. Xoá dữ liệu theo yêu cầu chủ dự án (26/11)

Chủ dự án chọn: **xoá toàn bộ dữ liệu nghiệp vụ, giữ tài khoản, xoá cả tệp R2.**

1. **Sao lưu trước khi xoá**
   - `wrangler d1 export` ra `.sql`: 251 dòng INSERT. Đã nạp thử vào SQLite và đếm khớp số bản ghi.
   - Tải về 6 object R2 (6,9 MB), đối chiếu đúng kích thước.
   - Toàn bộ gói trong `production-backup-20261126.zip`. **Chủ dự án giữ tệp này, đây là bản duy nhất của 6 tệp R2.**
   - Time Travel bookmark trước khi xoá: `00000010-00000000-0000512f-d18e7ad17a1c6ec8ae562df3b2808bfc`.
2. **Xoá trên D1:** `documents`, `contracts`, `partners`, `notifications`, `audit_logs`, `auth_revoked_sessions`, `auth_login_failures`, `system_data`, `uploaded_files`, `file_chunks`. Sau đó tăng `meta.data_version`.
   **Giữ lại:** `users` (3 tài khoản `admin`, `trang.tran`, `user`, nguyên mật khẩu), `app_config` (danh mục, cài đặt, tiền tệ), `meta`, `d1_migrations`.
3. **Xoá 6 object** trong R2 `document-manager-files`. Sau khi xoá, bucket còn 0 object.

## 4. Lấy đúng bản staging đã duyệt

- Bản build trên GitHub (`review/staging-4a79471`) **không khớp** với staging: build ra `index-D_0xDIPX.js`, trong khi staging chạy `index-CtZoY2S_.js`. Như vậy Codex chưa push hết thay đổi.
- Không có checkout staging trong môi trường của Claude. Vì vậy, với token có quyền đọc Workers trên tài khoản `viettungcao2`, Claude tải trực tiếp từ Cloudflare:
  - Worker `bpnm-doc-hub-staging`, **Version ID `bb43c355-1ec6-4d59-aabc-643b280ea348`** (deploy 23/11 10:39 UTC);
  - module server `index.js` (wrangler/esbuild, không minify, còn chú thích `// src/server/...`);
  - giao diện: `index.html`, `assets/index-CtZoY2S_.js`, `assets/index-DUAHPbcE.css` và các tệp public.
- Đẩy lên `Xichlo1234/bpnm-doc-hub-staging-src` › `main`: commit `7746427` (bản chụp) và `2bbe9dd` (cấu hình Production). Tệp `SNAPSHOT.json` ghi SHA-256 của từng tệp.
- **Phần có trên staging mà thiếu trên GitHub:**
  - `src/server/utils/idempotency.ts`: header `Idempotency-Key` khi tạo hồ sơ, ID suy ra từ SHA-256 của (prefix, user, key), không cần bảng mới;
  - các chuỗi `createAlreadySaved`, `createOutcomeUnknownRetry`, `srvCommitOutcomeUnknown`, `srvIdempotentRecordTrashed`;
  - `workspace-navigation`;
  - icon `bpmn-icon.svg` mới.
- **Migration:**
  - Sổ migration của D1 staging có đúng 0001–0011, trong đó có `0011_stabilization.sql`.
  - Schema D1 staging khớp với bộ migration của `4a79471`. Khác biệt duy nhất là bảng cũ `uploaded_files` có từ trước 0001.
- **Rà bảo mật bản chụp:**
  - không có token, `.dev.vars` hay ID database/bucket staging;
  - có mật khẩu khởi tạo `Admin@6868` / `User@123456`, vốn đã có trong mã nguồn và bị bắt đổi ở lần đăng nhập đầu;
  - phát hiện biến **`STAGING_ALLOW_LOGIN_RETRIES`**: khi bằng `"1"`, biến này **tắt khoá đăng nhập sai nhiều lần**. Chỉ staging đặt biến này; Production không có và tuyệt đối không được đặt.

## 5. Triển khai (27/11, giờ UTC)

| Bước | Thời điểm | Kết quả |
|---|---|---|
| Sao lưu D1 trước deploy | 09:56 | `pre-deploy-20261127-0956.sql` (chỉ còn 3 tài khoản). Bookmark `00000014-00000000-00005130-222f52298c259fa4a7e743dbb8b3c40c` |
| Deploy bản `bb43c355` với `MAINTENANCE_MODE=1` | 13:08 | Version `75564acd`. API trả 503 MAINTENANCE, health 200, giao diện `index-CtZoY2S_.js` |
| `wrangler d1 migrations apply` 0004 → 0011 | 13:08–13:09 | Đã áp đủ 11 migration, không còn chờ, preflight không có lỗi chặn. Schema Production trùng staging (chỉ khác 3 bảng cũ trống trước 0001: `uploaded_files`, `system_data`, `file_chunks`) |
| Deploy lại với `MAINTENANCE_MODE=0` | 13:20 | **Version `8f2264c8`, 100% lưu lượng** |

Lưu ý: `PRAGMA integrity_check` bị D1 API từ chối (`SQLITE_AUTH`). Việc kiểm tra toàn vẹn được thay bằng so schema với staging và đếm bản ghi.

## 6. Kiểm tra sau triển khai

| Mục | Kết quả |
|---|---|
| Binding | D1 `document-manager-db`, R2 `document-manager-files`, `AUTH_SECRET`, `MAINTENANCE_MODE=0`. **Không có** `STAGING_ALLOW_LOGIN_RETRIES` |
| Giao diện | `index-CtZoY2S_.js` / `index-DUAHPbcE.css`, trùng staging. Link sâu `/documents/...` trả 200 |
| Smoke chỉ đọc (`scripts/smoke-test.mjs`, không dùng tài khoản) | **13/13 đạt**: health, SPA, mọi API ẩn danh trả 401, token giả trả 401, path traversal bị chặn |
| Dữ liệu | Trống. Còn 3 tài khoản đang hoạt động |
| Chưa kiểm | Đăng nhập thật và tạo hồ sơ (chờ chủ dự án thử). Khởi tạo khoá mã đối tác Unicode (0011) diễn ra ở lần chạy đầu tiên |

## 7. Sự cố trong quá trình và cách xử lý

| Sự cố | Nguyên nhân | Xử lý |
|---|---|---|
| `wrangler deploy` từ môi trường của Claude lỗi 401 ở `/workers/assets/upload` | Proxy mạng của môi trường ghi đè header `Authorization` bằng API token, trong khi bước tải asset cần JWT phiên do Cloudflare cấp | Chủ dự án chạy các lệnh ghi trên máy của mình. Production không bị đổi trong các lần lỗi |
| `wrangler login` → `code: 7403` | Trình duyệt đăng nhập Cloudflare bằng tài khoản không có quyền trên `cc8e2a54…` | Dùng API token qua `$env:CLOUDFLARE_API_TOKEN` |
| `Authentication error [code: 10000]` | Token đã bị Roll | Tạo token dùng một lần từ mẫu "Edit Cloudflare Workers" |
| Token lộ trong ảnh chụp màn hình gửi vào phiên | Chụp PowerShell sau khi dán token | **Phải xoá token `cfut_11URBZ…`** (xem mục 9) |
| `wrangler deploy --dry-run` không phát hiện lỗi chạy thật | Dry-run không chạy workerd | Kiểm tra trên trang thật sau deploy |

## 8. Quay lại khi có sự cố

- **Không** rollback về version `016b2f7a` (20/11): schema đã lên 0011, mã cũ thiếu các bảo vệ.
- Dừng ghi ngay bằng chế độ bảo trì:
  `npx wrangler@3.114.17 deploy --config deploy/wrangler.production.jsonc --var MAINTENANCE_MODE:1`
- Rollback chỉ được phép về `75564acd` hoặc `8f2264c8`: cùng mã, khác cờ bảo trì.
- Dữ liệu: Time Travel về các bookmark ở mục 3 và 5, hoặc nạp tệp `.sql` vào database mới. Tệp R2 cũ chỉ còn trong tệp ZIP do chủ dự án giữ.

## 9. Việc còn lại (đề nghị reviewer xác nhận và bổ sung)

| # | Việc | Mức |
|---|---|---|
| 1 | **Đẩy mã nguồn gốc của bản `bb43c355`** (có `idempotency.ts`, giao diện mới) từ checkout của Codex lên repo chính. Build lại phải ra đúng `index-CtZoY2S_.js`. Hiện Production chạy bản build không có mã nguồn trên GitHub | Chặn mọi bản vá sau |
| 2 | Xoá token `cfut_11URBZ…` (đã lộ) và token dùng một lần `QUAN LY CONG VAN BPNM`. Quyết định giữ hay xoá `claude-bpnm-release` | Bảo mật, làm ngay |
| 3 | Sửa `wrangler.jsonc` của repo hoặc tách cấu hình môi trường, để `deploy` mặc định không trỏ nhầm sang `bpnm.tungcv.vn` / `bpnm-doc-hub-db` | Cao |
| 4 | Thống nhất nhánh: `pr09-stabilization` (Claude), `codex/pr09-stabilization`, `review/staging-4a79471`, `ui-compact-nav`. Production đang theo nhánh Codex | Cao |
| 5 | Các lỗi nghiệp vụ còn trong bản đang chạy (mục 10) | Cao/Trung bình |
| 6 | Viết lại lịch sử Git để xoá dữ liệu thật (quyết định 1A, sau merge) | Theo kế hoạch |
| 7 | Chủ dự án lưu `production-backup-20261126.zip` ở nơi bền vững | Ngay |
| 8 | Đăng nhập thử, tạo hồ sơ thử. Sau đó preflight: `partner_code_keys` đã khởi tạo | Ngay |

## 10. Lỗi nghiệp vụ đã phát hiện khi rà soát vai trò văn thư (chưa sửa trong bản đang chạy)

Kiểm trên commit `4a79471`, dữ liệu giả, qua API:

| Mức | Kịch bản | Hiện tại |
|---|---|---|
| **Bảo mật** | Độ mật gõ "Mat" (không dấu) | Không được coi là Mật, ai cũng xem được |
| Cao | Gõ nhầm số đến `ĐẾN-2026-0500` | Sổ nhảy lên 0501, mất vĩnh viễn dải số |
| Cao | Đổi số đến sau khi vào sổ | Được phép, không cần lý do, và làm sổ nhảy số |
| Cao | Vào sổ bù số cũ | Âm thầm đổi sang số mới |
| Cao | Ngày `2026-13-45` | Vẫn nhận |
| Cao | Văn bản đi lấy số ngay khi dự thảo, huỷ thì mất số | Thủng sổ đi (NĐ 30/2020: cấp số khi ký ban hành). **Cần chủ dự án duyệt quy trình** |
| TB | Hạn xử lý trước ngày nhận; ngày ban hành sau ngày nhận; ngày nhận ở tương lai | Vẫn nhận |
| TB | Nhận trùng (cùng cơ quan, cùng số gốc) | Không cảnh báo |
| TB | Số năm 2025 cho văn bản nhận năm 2026; số tự do "CV-ABC" | Vẫn nhận |
| TB | Văn bản đi "Đã gửi" mà không có nơi nhận | Vẫn nhận |
| TB | Văn bản nội bộ/quyết định với trạng thái tuỳ ý | Vẫn nhận |
| TB | Trích yếu chỉ có khoảng trắng | Vẫn nhận |
| TB | Người xử lý là chữ tự do, không gắn tài khoản | Người đó không nhận được thông báo |
| UI | Form CV đến chọn sẵn "UBND tỉnh Sơn La" / "Ban Giám đốc"; ngày văn bản mặc định là hôm nay; ngày hiển thị dạng mm/dd/yyyy | Dễ lưu sai |
