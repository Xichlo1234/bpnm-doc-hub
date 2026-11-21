# Checklist phát hành — BPNM Doc Hub (PR #1 → #9)

Đánh dấu theo thứ tự. Mục nào chưa đạt → chưa được làm bước sau. Chi tiết lệnh: `DEPLOY_RUNBOOK.md`.

## A. Trước khi merge
- [ ] Reviewer độc lập kết luận **GO** trên commit cuối của PR #9 (ghi SHA: `__________`).
- [ ] CI xanh trên từng PR #1 → #9.
- [ ] Chủ dự án đồng ý thứ tự merge #1 → #9 (xếp chồng, không squash lịch sử của nhau).
- [ ] Sau merge: CI trên `main` xanh; `git rev-parse main` = `__________`.

## B. Trước ngày triển khai
- [ ] `npm ci && npm run check && npm run audit:prod` PASS trên máy triển khai, đúng SHA `main`.
- [ ] Diễn tập staging cục bộ (workerd) theo `DEPLOY_RUNBOOK.md` mục 9: smoke `--write` PASS.
- [ ] (Nếu có môi trường staging Cloudflare) deploy cùng SHA lên staging, chạy đủ bước 2–7 với dữ liệu giả lập.
- [ ] Preflight chỉ đọc Production (đã được duyệt): không có `CHẶN:`; nếu có mã đối tác trùng / tên đăng nhập
      trùng → chủ dự án quyết định cách xử lý **trước** ngày triển khai.
- [ ] Bucket R2 sao lưu đã sẵn sàng; quyền `wrangler` của người thực hiện đã kiểm tra.
- [ ] Thông báo khung giờ bảo trì cho người dùng.

## C. Ngày triển khai (runbook bước 0 → 7)
- [ ] 0 Điều kiện bắt đầu · [ ] 1 Preflight · [ ] 2 Bảo trì · [ ] 3 Rào chắn `verify` PASS
- [ ] 4 Sao lưu + phục hồi thử · [ ] 5 Migration 0004→0011 · [ ] 6 Toàn vẹn + gỡ rào chắn · [ ] 7 Mở ghi
- [ ] Ghi Version ID mốc an toàn: `__________`.

## D. Sau triển khai (24 giờ đầu)
- [ ] Không có lỗi 5xx lặp lại (`wrangler tail`), không có `COMMIT_UNKNOWN` lặp lại.
- [ ] Preflight chỉ đọc: `partner_code_key_missing` = 0 (trừ mã trùng đã báo), `unregistered_numbers` rỗng.
- [ ] `GET /api/admin/storage-cleanup` → không tồn đọng lỗi.
- [ ] Ghi kết quả vào `docs/WORKLOG.md`.
- [ ] (Quyết định 1A) Lên kế hoạch viết lại lịch sử git để xoá dữ liệu thật — thao tác riêng, cần phê duyệt riêng.
