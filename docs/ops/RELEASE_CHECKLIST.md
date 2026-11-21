# Checklist bàn giao PR09

- [x] Hồi quy E1–E7 và smoke localhost với dữ liệu giả.
- [x] Kiểm tra TypeScript server/API client, npm audit runtime, Wrangler dry-run Worker với asset mẫu.
- [x] Wrangler local khôi phục từ schema 0001–0003 vào binding mới, sau đó áp 0004–0011. D1 nguồn đã khóa từ chối ghi.
- [ ] CI trên SHA cuối chạy đủ npm ci, typecheck, suite Excel, build SPA và Wrangler dry-run với artifact production. HTTP 403 hiện chặn tải SheetJS 0.20.3.
- [ ] UAT trình duyệt và staging D1/R2 độc lập. Kiểm chứng ứng dụng cũ bị chặn ghi D1, R2 Bucket Locks qua S3 và Worker binding, tệp tải được sau phục hồi, kế hoạch rollback/roll-forward và độ trễ của hàng đợi MemoryStore.
- [ ] Reviewer độc lập kết luận GO trên SHA cuối rồi chủ dự án duyệt phương án Production.

Trước khi xin duyệt Production, kiểm tra ref PR09 và thứ tự merge, xin quyền preflight D1 chỉ đọc, rà xung đột mã lịch sử, xác minh backup và định danh nguồn/đích. Thực hiện theo [runbook cutover](DEPLOY_RUNBOOK.md) sau phê duyệt.
