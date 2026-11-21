# Lưu trữ hồ sơ & tệp (D1/R2)

## Luồng lưu hồ sơ

Tạo hồ sơ → kiểm tra dữ liệu (zod) → kiểm tra quyền → lưu tệp lên R2 + đăng ký `file_uploads`
→ ghi D1 (bản ghi, tệp đính kèm, lịch sử, audit trong **một transaction**) → trả 201.

- Dữ liệu hoặc quyền không hợp lệ: không ghi tệp nào lên R2.
- Ghi D1 thất bại: tệp vừa ghi bị xoá khỏi R2, API trả lỗi, bộ nhớ đệm được nạp lại từ D1.
- Client chỉ báo thành công khi API trả về thành công; upload trong form sửa chỉ báo "đã tải lên, bấm
  Lưu để gắn vào hồ sơ".

## Nhiều tệp, phiên bản

Bảng `attachments` (migration 0006): mỗi dòng là một phiên bản tệp (tên gốc, dung lượng, loại,
SHA-256, người/thời gian tải). `series_id` gom các phiên bản của cùng một tệp; thay tệp tạo phiên bản
mới (`version + 1`), bản cũ vẫn tải được. `file_key` trên bản ghi là tệp chính (giao diện cũ vẫn dùng).

API:
- `GET /api/attachments/:type/:id[?versions=1]`
- `POST /api/attachments/:type/:id` (multipart `file`, tuỳ chọn `replaces=<attachment id>`)
- `DELETE /api/attachments/:attId` (gỡ khỏi hồ sơ; tệp vẫn giữ trên R2 tới khi xoá vĩnh viễn hồ sơ)

Hồ sơ cũ chỉ có `file_key` được hiển thị như phiên bản 1 ở lần đầu mở.

## Xoá tệp hai pha (migration 0009)

- Xoá vĩnh viễn hồ sơ chỉ **đưa vào hàng đợi** (`storage_cleanup`, cùng transaction với việc xoá hồ sơ).
- Sau khi commit, hệ thống hỏi lại **D1** xem còn hồ sơ/tệp đính kèm nào dùng tệp không: còn → `kept`
  (không xoá); không → xoá object → `deleted`. Lỗi R2 → vẫn `pending`, ghi `attempts`, `last_error`,
  thử lại bằng `POST /api/admin/storage-cleanup`.
- Tệp trong hàng đợi/đã xoá là **tombstone**: không ai gắn lại được (kể cả admin; D1 chặn bằng `file_guard`),
  người không phải admin không bao giờ đọc được — kể cả người đã upload, kể cả khi xoá R2 thất bại.
- Tệp đã từng gắn vào hồ sơ (`file_uploads.attached_at`) không bao giờ trở lại trạng thái "tệp riêng của người upload".

## Thùng rác

Xoá văn bản/hợp đồng/đối tác chỉ đặt `deleted_at`/`deleted_by` (migration 0006). Admin xem, khôi phục
hoặc xoá vĩnh viễn ở Thiết lập → Thùng rác (`/api/trash`). Xoá vĩnh viễn chỉ xoá tệp R2 sau khi D1 đã
commit và khi không còn hồ sơ nào khác tham chiếu tệp.

## Lịch sử chỉnh sửa

Bảng `record_history`: mỗi lần tạo/sửa/xoá/khôi phục/nhập Excel/đính kèm ghi các trường thay đổi
`{field: [trước, sau]}`, người sửa và thời gian, trong cùng transaction với thay đổi.
`GET /api/history/:type/:id` (theo quyền đọc hồ sơ).

## Vị trí hồ sơ giấy

Các trường chuẩn `storage_warehouse` (Kho), `storage_cabinet` (Tủ), `storage_shelf` (Ngăn),
`storage_box` (Hộp). Khi có ít nhất một trường, `storage_location` được dựng lại theo định dạng
`Kho A / Tủ 02 / Ngăn 3 / Hộp 15`.

## Google Drive

Chỉ là **liên kết**: hệ thống lưu đường dẫn chia sẻ, không sao chép hay đồng bộ tệp. Giao diện và API
(`link_only: true`) ghi rõ điều này.

## Đối soát D1/R2

`GET /api/admin/storage-check` (admin, chỉ đọc): liệt kê tệp được tham chiếu nhưng không còn trên
R2/D1 cũ (`missing`) và tệp trên R2 không thuộc hồ sơ nào quá 24 giờ (`orphans`). Không tự xoá.
