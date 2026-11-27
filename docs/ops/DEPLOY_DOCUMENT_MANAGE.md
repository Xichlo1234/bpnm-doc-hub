# Deploy document-manage.tungcv.vn

| | |
|---|---|
| Nhánh production | `release/document-manage` (Cloudflare Workers Builds tự deploy khi có commit mới) |
| Worker | `quan-ly-cong-van` |
| D1 / R2 | `document-manager-db` (`dd6a5309-85ff-449b-bdbd-b1aa239dcb77`) / `document-manager-files` |
| Build / Deploy command | `npm run build` / `npx wrangler deploy --env document-manage` |
| Gốc nhánh | `54f671a`, đã đối chiếu 27/11/2026: giao diện, server bundle và migration 0001–0011 trùng bản đang chạy |

Quy tắc:
- Thay đổi vào nhánh này qua PR. Merge = deploy Production.
- Build **không** chạy migration D1. Có migration mới thì làm theo `DEPLOY_RUNBOOK.md` (bảo trì → sao lưu → migrate → mở ghi) cho `document-manager-db`.
- Không đặt `STAGING_ALLOW_LOGIN_RETRIES` trên Worker này.
- Không merge PR tự sinh của Cloudflare đổi `"name"` trong `wrangler.jsonc`.
- Commit rỗng không kích hoạt build (Build watch paths): commit phải đổi ít nhất một tệp.
