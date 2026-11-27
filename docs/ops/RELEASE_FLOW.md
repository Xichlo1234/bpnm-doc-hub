# Quy trình phát hành chung cho hai đơn vị

Một mã nguồn, hai Production. Dữ liệu, secret và cấu hình mỗi bên tách riêng.

| Đơn vị | Nhánh Workers Builds | Worker | Tên miền | D1 / R2 | Lệnh deploy |
|---|---|---|---|---|---|
| Document-manage | `release/document-manage` | `quan-ly-cong-van` | document-manage.tungcv.vn | `document-manager-db` / `document-manager-files` | `npx wrangler deploy --env document-manage` |
| BPNM | `release/bpnm` | `bpnm-doc-hub` | bpnm.tungcv.vn | `bpnm-doc-hub-db` / `bpnm-doc-hub-files` | `npx wrangler deploy` |

## Đưa một thay đổi lên
1. PR vào `release/document-manage` (CI xanh) → merge → Cloudflare tự deploy document-manage.
2. Kiểm tra document-manage (đăng nhập, mở hồ sơ, health).
3. Đưa đúng commit đó sang BPNM (chỉ fast-forward, không sửa riêng trên `release/bpnm`):
   ```bash
   git fetch origin
   git push origin origin/release/document-manage:refs/heads/release/bpnm
   ```
   Cloudflare tự deploy BPNM.

Sửa lỗi một lần, hai bên cùng nhận. Bên nào cần khác (tên, logo, menu, tính năng) thì dùng biến trong `wrangler.jsonc` theo từng env hoặc cài đặt trong `app_config`, không tách mã.

## Khi có migration D1 mới
Workers Builds không chạy migration. Với **mỗi** database, theo thứ tự, **trước** khi merge/đẩy nhánh:
deploy bảo trì (`--var MAINTENANCE_MODE:1`) → `wrangler d1 export` + ghi bookmark → `wrangler d1 migrations apply <db> --remote` → preflight → deploy thường.

## Không được
- Đặt `STAGING_ALLOW_LOGIN_RETRIES` trên Production.
- Merge PR tự sinh của Cloudflare đổi `"name"` trong `wrangler.jsonc`.
- Commit rỗng để kích hoạt build (Build watch paths bỏ qua): commit phải đổi ít nhất một tệp.
