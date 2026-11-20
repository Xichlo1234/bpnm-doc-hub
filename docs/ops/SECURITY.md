# Mô hình bảo mật & phân quyền

## Vai trò và quyền

| Quyền | admin | user | user + `can_access_labor_contracts` | user + `can_access_confidential_documents` |
|---|---|---|---|---|
| Xem văn bản thường, hợp đồng kinh tế, đối tác | ✔ | ✔ | ✔ | ✔ |
| Xem văn bản độ mật "Mật/Tối mật/Tuyệt mật" và tệp của chúng | ✔ | ✘ | ✘ | ✔ |
| Xem hợp đồng lao động và tệp của chúng | ✔ | ✘ | ✔ | ✘ |
| Tạo/sửa văn bản, đối tác, danh mục, cài đặt, người dùng | ✔ | ✘ | ✘ | ✘ |
| Tạo/sửa hợp đồng lao động, tải tệp lên | ✔ | ✘ | ✔ | ✘ |
| Nhập Excel, thanh lý, xóa | ✔ | ✘ | ✘ | ✘ |

Toàn bộ quy tắc nằm ở `src/server/utils/access.ts` và `src/server/utils/fileAccess.ts`.

## Tệp đính kèm (R2)

- Chỉ admin và người quản lý HĐLĐ được tải tệp lên (`UPLOAD_FORBIDDEN`).
- Mỗi lần tải lên được ghi vào bảng `file_uploads` (người tải, tên gốc, dung lượng, loại, SHA-256).
- Một tệp chỉ đọc được khi người dùng đọc được ít nhất một hồ sơ đang tham chiếu tệp đó. Tệp chưa gắn
  vào hồ sơ chỉ người tải lên và admin đọc được.
- Người không phải admin không thể gắn `file_key` của hồ sơ khác vào hồ sơ của mình (`FILE_ATTACH_FORBIDDEN`).
- Tệp bị từ chối khi tạo hồ sơ không được ghi lên R2; nếu lưu hồ sơ thất bại, tệp vừa ghi bị xoá.

## Mật khẩu & phiên đăng nhập

- Mật khẩu băm PBKDF2-SHA256 (100k vòng); mật khẩu văn bản thuần cũ được băm lại ở lần đăng nhập đầu.
- `must_change_password` được kiểm tra **tại backend**: khi cờ bật, mọi API trừ `/api/auth/me` và
  `/api/auth/change-password` trả `403 PASSWORD_CHANGE_REQUIRED`. Cờ được bật khi:
  - tài khoản khởi tạo của bản cài mới;
  - đăng nhập bằng một mật khẩu mặc định từng công bố (`Admin@6868`, `User@123456`, `123456`);
  - admin tạo tài khoản hoặc đặt lại mật khẩu cho người khác (mật khẩu tạm).
- Token phiên ký HMAC (`AUTH_SECRET`), hạn 7 ngày; đổi mật khẩu/đặt lại mật khẩu thu hồi mọi phiên cũ;
  đăng xuất thu hồi phiên hiện tại (bảng `auth_revoked_sessions`). Đăng nhập sai 5 lần/15 phút bị chặn.
- Cookie phiên chỉ dùng cho `GET /api/files/*` (HttpOnly, SameSite=Strict); các API khác bắt buộc
  header Bearer nên không bị CSRF.

## Thông báo

Mỗi thông báo thuộc về một tài khoản (`recipient_user_id`, khớp tên/username/email người xử lý).
Người dùng chỉ thấy và đánh dấu đọc thông báo của mình; thông báo không khớp tài khoản nào chỉ admin thấy.

## Header bảo mật

Mọi phản hồi có CSP (`script-src 'self'`), `X-Frame-Options`, `HSTS`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`.

## Dữ liệu trong mã nguồn

Mã nguồn triển khai không chứa dữ liệu nghiệp vụ: bản cài mới khởi tạo rỗng (chỉ có tài khoản quản trị
bắt buộc đổi mật khẩu). Bộ dữ liệu kiểm thử ở `tests/fixtures` là dữ liệu giả lập đã ẩn danh. Chạy thử
cục bộ với dữ liệu mẫu: `SEED_DEMO=1 npm run dev` (chỉ áp dụng cho cơ sở dữ liệu local mới).
