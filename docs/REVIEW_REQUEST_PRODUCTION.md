# Yêu cầu thẩm định sau phát hành Production (27/11/2026)

**Đọc trước:** `docs/ops/PRODUCTION_RELEASE_2026-11-27.md` (nhánh `docs/production-release-2026-11-27`).

**Bản đang chạy:** bản chụp staging `bb43c355` tại `Xichlo1234/bpnm-doc-hub-staging-src@2bbe9dd`. Thư mục `deployed/server/index.js` vẫn đọc được: không minify, có chú thích tên tệp nguồn.

Đề nghị reviewer:
1. Xác nhận bản đang chạy an toàn:
   - binding và biến môi trường (không có `STAGING_ALLOW_LOGIN_RETRIES`);
   - chế độ bảo trì;
   - xử lý `Idempotency-Key` trong `deployed/server/index.js` (mục `// src/server/utils/idempotency.ts` và các route tạo hồ sơ).
2. **Đẩy mã nguồn gốc** của `bb43c355` từ checkout đã deploy staging lên `Xichlo1234/bpnm-doc-hub`, nhánh `release/production-candidate`. Build lại phải ra đúng `assets/index-CtZoY2S_.js` và `index-DUAHPbcE.css`. Chạy `npm test`.
3. Đề xuất cách thống nhất các nhánh (mục 9.4), tách cấu hình Production khỏi `wrangler.jsonc` (mục 9.3), và thứ tự sửa các lỗi nghiệp vụ ở mục 10.
4. Kết luận: bản đang chạy **giữ nguyên** hay **cần vá gấp**, kèm danh sách việc.

Ràng buộc: không deploy, không chạy migration hay ghi dữ liệu Production khi chưa có chủ dự án duyệt; không force-push.
