# Plan: Dịch đầy đủ 3 ngôn ngữ (vi / en / km)

Ngày: 2026-10-27

## Kết quả (cập nhật 2026-10-27)

Đã hoàn thành bước 0–5.

- **Client:** 0 chuỗi tiếng Việt viết cứng (`tests/i18n_hardcoded.baseline.json` rỗng). Không còn `tr()`,
  `isEn`/`isKm`. Từ điển có 933 key × 3 ngôn ngữ, cộng 77 nhãn cho giá trị mặc định (`seedLabels.ts`).
- **Giá trị lưu trữ** (trạng thái, độ khẩn, loại văn bản, phòng ban…) giữ nguyên tiếng Việt, chỉ dịch khi
  hiển thị qua `statusLabel` / `urgencyLabel` / `seedLabel`. Danh mục người dùng tự tạo hiển thị nguyên văn.
- **Hạn xử lý / hiệu lực:** client dựng nhãn từ `level` + `daysRemaining` (`deadlineLabels.ts`); test
  `deadline_labels.test.ts` khẳng định bản tiếng Việt trùng khớp `label` của server ở cả 19 level.
- **Lỗi API:** server gửi thêm `code` (+ `params`) cạnh `error`; client dịch theo `code`
  (`serverErrors.ts`). Test `server_error_codes.test.ts` bắt lỗi khi server có mã chưa được dịch.
- **Định dạng:** ngày giữ `dd/mm/yyyy` GMT+7 (đúng cho cả 3 ngôn ngữ); tiền định dạng theo loại tiền,
  không theo ngôn ngữ. Đã sửa bảng đối tác và chi tiết hợp đồng luôn hiển thị kiểu `vi-VN` + `₫`.
- **Review Khmer:** `npm run i18n:export` → `docs/i18n/translations.csv` (key, vi, en, km).
- **Nghiệm thu giao diện** (DB tạm, tài khoản seed): đã duyệt đăng nhập, đổi mật khẩu, danh sách, bảng công văn,
  bảng hợp đồng, đối tác, 9 tab thiết lập, form thêm mới (4 tab) bằng km/en; phần còn tiếng Việt đều là dữ liệu.

Giới hạn còn lại:
- Toàn bộ bản Khmer do máy soạn, **cần người bản ngữ rà soát** (dùng file CSV).
- Chi tiết nhật ký (audit log `details`) là câu server ghi lúc sự kiện xảy ra → giữ nguyên tiếng Việt.
- Header cột file Excel/CSV xuất – nhập giữ tiếng Việt (định dạng file).
- Nút "Xem HĐ (n)" ở bảng đối tác xuống 2 dòng khi dùng tiếng Khmer (không mất chữ).

## 1. Hiện trạng

- Từ điển: `src/client/src/i18n/index.ts`, ~300 key mỗi ngôn ngữ, **3 ngôn ngữ đã đồng bộ key**
  (`tests/i18n.test.ts` kiểm tra). Vậy thiếu dịch **không nằm ở từ điển** mà ở chỗ UI không dùng từ điển.
- `LanguageContext` trả `t` là object phẳng → không có tham số (`Còn ${days} ngày`), không có fallback theo key.
- Có 3 cách hiển thị chữ đang lẫn lộn:
  1. `t.key` (đúng).
  2. Ternary/helper tại chỗ: `language === 'vi' ? ... : ...`, `tr(vi, en, km?)` — km thường rơi về en.
  3. Chuỗi tiếng Việt hard-code — **nguồn chính của lỗi thiếu dịch**.

### Số dòng chứa tiếng Việt hard-code (client, ngoài i18n)

| File | Dòng VI | `t.` đang dùng |
|---|---:|---:|
| CreateModal.tsx | 247 | 18 |
| CategorySettingsView.tsx | 180 | 0 |
| DocumentTableView.tsx | 140 | 75 |
| EditRecordModal.tsx | 92 | 6 (không dùng `useLanguage`) |
| DetailPane.tsx | 79 | 23 |
| ExcelManagerModal.tsx | 69 | 17 |
| UserManagerView.tsx | 50 | 5 |
| DocumentViewer.tsx | 33 | 0 (không dùng `useLanguage`) |
| AuditLogView.tsx | 32 | 0 |
| PartnerModal.tsx | 28 | 0 (không dùng `useLanguage`) |
| PartnerTableView.tsx | 26 | 26 |
| utils/itemFilters.ts | 23 | 9 |
| services/api.ts | 22 | 0 |
| ContractTableView / Sidebar | 18 / 18 | |
| utils/categoryHelpers.ts | 15 | 0 |
| ChangePasswordView, App, ItemList, SpotlightModal, useAppChrome, stats bars, Header, LoginView, text.ts, currency.ts | ≤ 9 mỗi file | |

Tổng ≈ 1.200 dòng client.

### Server trả chữ tiếng Việt về UI

- `server/utils/urgency.ts` (26): nhãn hạn xử lý `Còn N ngày`, `Quá hạn N ngày`, `Đã thanh lý`… → UrgencyBadge hiển thị nguyên văn.
- `server/utils/validation.ts` (14) + routes `auth/contracts/files/users/documents/partners/categories` (~60): thông báo lỗi.
- `server/db/seed.ts`, `store.ts` (~60): dữ liệu mẫu, tên danh mục.

### Dữ liệu là tiếng Việt (không được dịch bằng cách sửa dữ liệu)

- Trạng thái lưu dạng chuỗi VI (`'Dự thảo'`, `'Đã gửi'`, `'Trình ký'`…) và được so sánh trong logic (urgency, filter).
- Tên loại văn bản, phòng ban, danh mục là dữ liệu do người dùng quản lý; hiện có `SEED_EN_MAP` riêng trong
  CategorySettingsView (chỉ VI→EN, không có km).

## 2. Nguyên tắc

1. **Mọi chuỗi UI đi qua từ điển.** Không còn ternary `language === ...` và không còn `tr(vi, en, km)`.
2. **Dữ liệu giữ nguyên, chỉ dịch lúc hiển thị.** Trạng thái/enum dùng map `giá trị lưu → key dịch`.
3. **Server trả mã, client dịch.** Urgency trả `{ code, days }`, lỗi trả `{ error, code, params }`;
   `error` (tiếng Việt) vẫn giữ để tương thích.
4. **Khmer không được im lặng rơi về English.** Thiếu km là test fail, không phải fallback.
5. Tên riêng/dữ liệu người dùng nhập (tên đối tác, số công văn, trích yếu) **không dịch**.

## 3. Các bước

### Bước 0 — Hạ tầng i18n (nhỏ, làm trước)
- Thêm hàm `tf(key, params)` hỗ trợ nội suy `{days}`, `{count}` (giữ `t.key` cũ để không phải sửa hết một lần).
- Tách từ điển thành `i18n/vi.ts`, `en.ts`, `km.ts`, kiểu của `en`/`km` = `Record<keyof typeof vi, string>`
  → TypeScript báo lỗi khi thiếu key.
- Thêm `i18n/enums.ts`: map trạng thái VI → key (`statusLabel(value)`), dùng chung cho bảng, filter, badge.
- Thêm `i18n/seedLabels.ts`: chuyển `SEED_EN_MAP` thành map có cả en + km cho tên danh mục mặc định;
  danh mục người dùng tự tạo hiển thị nguyên văn.

### Bước 1 — Test chặn hồi quy (làm trước khi dịch)
- Mở rộng `tests/i18n.test.ts`:
  - km không được trùng y hệt en (trừ allowlist: `DocHub`, mã viết tắt, đơn vị tiền).
  - Mọi placeholder `{x}` trong vi phải có trong en và km.
- Test mới `tests/i18n_hardcoded.test.ts`: quét `src/client/src/**/*.{ts,tsx}` (trừ thư mục `i18n/`),
  báo lỗi nếu chuỗi literal/JSX text chứa dấu tiếng Việt. Có allowlist cho các hằng là **giá trị dữ liệu**
  (trạng thái, mã seed). Ban đầu test lưu baseline số lượng theo file và chỉ được giảm → về 0 ở cuối.

### Bước 2 — Client, theo thứ tự ảnh hưởng người dùng
Mỗi nhóm là một commit; sau mỗi nhóm chạy test + soát giao diện ở cả 3 ngôn ngữ.

| Đợt | File | Ghi chú |
|---|---|---|
| 2a | services/api.ts, useAppChrome.ts, App.tsx, ChangePasswordView, LoginView, Header, Sidebar, ItemList, SpotlightModal, stats bars | Thông báo lỗi chung, khung ứng dụng; bỏ ternary inline |
| 2b | utils/itemFilters.ts, categoryHelpers.ts, text.ts, currency.ts | Tiêu đề bộ lọc, nhãn HĐ lao động — nhận `t` làm tham số thay vì chuỗi cứng |
| 2c | DocumentTableView, ContractTableView, PartnerTableView, DetailPane | Màn hình xem chính |
| 2d | CreateModal, EditRecordModal, PartnerModal | Form: label, placeholder, validate message, option trạng thái (qua `statusLabel`) |
| 2e | ExcelManagerModal, DocumentViewer | Tiêu đề cột Excel xuất ra: **giữ tiếng Việt cho file import/export** (tránh vỡ import), chỉ dịch UI hộp thoại |
| 2f | CategorySettingsView, UserManagerView, AuditLogView | Màn hình quản trị; thay `tr()` bằng key; nhãn action audit qua map |

### Bước 3 — Server trả mã thay vì câu
- `urgency.ts`: thêm `code` (`overdue`, `daysLeft`, `liquidated`, `terminated`, `indefinite`, `completedLate`…)
  và `days`; giữ `label` cũ. `UrgencyBadge` dịch theo `code`.
- Lỗi API: thêm `code` cho các lỗi người dùng hay thấy (đăng nhập sai, hết phiên, xung đột 409, quyền,
  file quá lớn, validate). `api.ts` ưu tiên dịch theo `code`, fallback `error`.
- Lỗi zod: trả danh sách `{ field, code }`; client dịch tên trường + loại lỗi.
- Seed/store: không đổi dữ liệu.

### Bước 4 — Nội dung Khmer
- Gom mọi key mới thêm ở bước 2–3, xuất bảng `key | vi | en | km` (script nhỏ ra CSV) để người biết Khmer
  rà soát; bản km đầu tiên do Claude dịch, đánh dấu cần review.
- Kiểm tra font Khmer hiển thị đúng (Noto Sans Khmer) và độ dài chữ km không làm vỡ layout header/sidebar/bảng.

### Bước 5 — Nghiệm thu
- `tests/i18n_hardcoded.test.ts` baseline = 0, mọi test pass, CI xanh.
- Smoke test: chạy app với `?lang=vi|en|km`, chụp màn hình các màn chính (đăng nhập, sổ công văn, bảng HĐ,
  chi tiết, form tạo, thiết lập, người dùng, nhật ký) — không còn chữ Việt ở en/km ngoài dữ liệu người dùng.
- Định dạng ngày/số/tiền theo locale (`vi-VN`, `en-GB`, `km-KH`) trong `dateTime.ts`/`currency.ts`.

## 4. Rủi ro

- **So sánh chuỗi trạng thái**: nếu vô tình dịch giá trị trước khi so sánh sẽ hỏng filter/urgency → chỉ dịch ở
  tầng hiển thị, có test filter hiện có bảo vệ (`item_filters`, `urgency`, `contract_filter`).
- **Excel import/export**: header cột là hợp đồng với file người dùng → giữ nguyên.
- **Khối lượng**: CreateModal và CategorySettingsView chiếm ~35% tổng; nên tách riêng commit/PR.

## 5. Ước lượng

| Bước | Công |
|---|---|
| 0–1 hạ tầng + test | 0,5 ngày |
| 2a–2b | 0,5 ngày |
| 2c | 1 ngày |
| 2d | 1–1,5 ngày |
| 2e–2f | 1–1,5 ngày |
| 3 server | 0,5–1 ngày |
| 4–5 Khmer + nghiệm thu | 0,5 ngày (+ thời gian người review km) |
| **Tổng** | **~5–6 ngày** |
