# Quy tắc nghiệp vụ (PR03)

## Công văn đến
- **Số đến** (`document_number`, dạng `ĐẾN-YYYY-NNNN`) do hệ thống cấp; **số văn bản của cơ quan gửi**
  nhập ở `original_doc_number`. Hai số trùng nhau → `INCOMING_NUMBER_SAME_AS_ORIGINAL`.
- Quy trình: Tiếp nhận (`Chưa phân công`) → Phân công (`Đã phân công`, bắt buộc người xử lý) →
  Đang xử lý → Hoàn thành (tự ghi `completed_date`) → Lưu trữ. Có thể trả lại bước trước.
- Ngày tiếp nhận mặc định là ngày hôm nay theo giờ Việt Nam (UTC+7).
- Mỗi lần giao việc/đổi người xử lý/hạn/chỉ đạo được ghi vào `directive_log`.

## Công văn đi
- Quy trình: Dự thảo → Trình ký → Đã ký (bắt buộc người ký) → Đã gửi (phát hành, ghi `issued_at`) → Lưu trữ;
  Hủy từ Dự thảo/Trình ký.
- Văn bản mới **luôn là Dự thảo**, không tự đặt "đã phát hành".
- Sửa số, trích yếu, người ký, ngày ban hành, nơi nhận, loại của văn bản đã phát hành cần
  `adjustment_reason`; mỗi lần điều chỉnh lưu vào `adjustments` và lịch sử (`adjust_after_issue`).

## Cấp số chống trùng
Định dạng số **không đổi** (`ĐẾN-YYYY-NNNN`, `NNNN/YYYY/LOẠI-PHÒNG`). Khi lưu, số theo định dạng tự động
được giữ chỗ nguyên tử trong bảng `number_sequences` (một câu `INSERT … ON CONFLICT … RETURNING`).
Nếu số người dùng nhận được đã bị người khác dùng trước, văn bản được cấp số kế tiếp và giao diện báo
lại. Số nhập tay (không theo định dạng) trùng → `409 DOCUMENT_NUMBER_TAKEN`.

## Hợp đồng
- Trạng thái lưu: `active` (hiệu lực; hết hạn được tính từ `end_date`), `liquidated` (thanh lý, có
  `liquidation_date`), `terminated` (chấm dứt, bắt buộc `termination_reason`).
- Kiểm tra mốc thời gian: kết thúc ≥ bắt đầu, kết thúc ≥ ngày ký, thanh lý/chấm dứt ≥ ngày ký.
- Số hợp đồng không trùng (không phân biệt hoa thường) → `409 CONTRACT_NUMBER_TAKEN`.
- Phụ lục (`POST /api/contracts/:id/appendices`): ký sau hợp đồng; `new_end_date` (gia hạn, phải sau
  ngày kết thúc hiện tại) và `new_value` cập nhật hợp đồng, lưu giá trị cũ trong phụ lục.
- Liên kết hồ sơ (`PUT /api/contracts/:id/links`): chỉ tới văn bản/hợp đồng tồn tại và người dùng đọc được.
- Thống kê giá trị: `valueByCurrency` (tổng theo từng loại tiền, luôn đúng). `totalContractValue`
  quy đổi về `report_currency` chỉ khi mọi loại tiền có tỷ giá; tỷ giá trong danh mục tiền tệ nghĩa là
  "1 đơn vị = `exchange_rate` đơn vị tiền mặc định (is_default)". Thiếu tỷ giá → `null` và
  `missingExchangeRates`.

## Nhập Excel
1. `POST /api/{documents|contracts}/import/preview`: kiểm tra từng dòng, phát hiện trùng trong file,
   phân loại thêm mới / cập nhật (kèm trường thay đổi) / không đổi / lỗi. Không ghi gì.
2. `POST …/bulk-import`: từ chối toàn bộ nếu có dòng lỗi (`IMPORT_HAS_ERRORS`); có dòng cập nhật mà
   chưa `confirm_updates: true` → `409 IMPORT_CONFIRMATION_REQUIRED`. Dòng trùng trong file bị bỏ qua.
3. Mỗi lần nhập ghi `import_batches` (người, thời gian, tên file, số thêm/cập nhật/bỏ qua) — `GET /api/imports`.
4. Xuất Excel dùng đúng danh sách người dùng được phép xem (đã lọc ở server).

## Chỉnh sửa đồng thời
- API so `expected_revision` (409 kèm bản mới nhất).
- **Câu lệnh ghi D1 tự kiểm tra revision**: mỗi batch ghi kèm câu bảo vệ vào bảng `write_guard`
  (CHECK luôn sai) khi bản ghi trong D1 đã khác revision đã đọc → cả transaction bị huỷ →
  `409 REVISION_CONFLICT`. Áp dụng cả khi hai Worker isolate khác nhau cùng ghi.
- Giao diện: "Tải bản mới nhất", "Hợp nhất" (áp thay đổi của mình lên bản mới, liệt kê trường bị sửa
  trùng) hoặc "Giữ bản của tôi".
