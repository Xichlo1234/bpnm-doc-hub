import type { ContractType } from '../../../../server/types.ts';


// Default Master Categories Fallbacks (Ensures no dropdown is ever empty)
// i18n-data
export const DEFAULT_DOC_TYPES = [
  { name: 'Công văn', code: 'CV' },
  { name: 'Quyết định', code: 'QĐ' },
  { name: 'Thông báo', code: 'TB' },
  { name: 'Tờ trình', code: 'TTr' },
  { name: 'Báo cáo', code: 'BC' },
  { name: 'Kế hoạch', code: 'KH' },
  { name: 'Giấy mời', code: 'GM' },
  { name: 'Biên bản', code: 'BB' },
  { name: 'Hợp đồng / Phụ lục', code: 'HĐ' },
  { name: 'Giấy phép / Chấp thuận', code: 'GP' },
  { name: 'Thư / Email chính thức', code: 'TH' },
];

// i18n-data
export const DEFAULT_CONTRACT_TYPES = [
  'Xay dung / Thi cong (Construction)',
  'Cung cap thiet bi / Vat tu (Supply)',
  'Dich vu ky thuat (Technical Services)',
  'Tu van (Consulting)',
  'Thue (nha, dat, thiet bi) (Lease)',
  'Van tai (Transport)',
  'Dich vu lao dong / Khoan viec (Labor/Manpower)',
  'Bao hiem (Insurance)',
  'Nguyen tac / Khung (Framework Agreement)',
  'Phu luc / Sua doi bo sung (Annex/Amendment)',
  'Agreement/ Thoa thuan',
  'Minutes/ Bien ban',
  'Notice/ Thong bao',
  'Khac (Other)',
];

// i18n-data
export const DEFAULT_CONTRACT_DEPTS = [
  'ADM - Hanh chinh',
  'LEG - Phap che',
  'LND - Dat dai - Cong dong',
  'ENV - Moi truong',
  'HSE - An toan-SK-MT',
  'HR - Nhan su',
  'FIN - Tai chinh-Ke toan',
  'ENG - Ky thuat',
  'PRO - San xuat',
  'COM - Truyen thong',
  'IT - CNTT',
  'GEO - Dia chat-Tham do',
  'MIN - Khai thac ham lo',
  'PLT - Bao tri nha may',
  'SCM - Chuoi cung ung',
  'QAC - Chat luong',
];

// i18n-data
export const DEFAULT_DEPARTMENTS = [
  { name: 'Ban Giám đốc', code: 'BGĐ' },
  { name: 'Hành chính - Nhân sự', code: 'HCNS' },
  { name: 'Tài chính - Kế toán', code: 'TCKT' },
  { name: 'An toàn - Sức khỏe - Môi trường', code: 'HSE' },
  { name: 'Khai thác', code: 'KT' },
  { name: 'Chế biến', code: 'CB' },
  { name: 'Cơ điện - Bảo trì', code: 'CĐ' },
  { name: 'Hạ tầng - Facilities', code: 'FAC' },
  { name: 'Pháp chế - Đối ngoại', code: 'PCĐN' },
  { name: 'Mua sắm - Kho', code: 'MSK' },
  { name: 'Thăm do - Địa chất', code: 'GEO' },
];

// i18n-data
export const DEFAULT_AGENCIES = [
  'UBND tỉnh Sơn La',
  'Sở Nông nghiệp và Môi trường',
  'Sở Công Thương',
  'Sở Xây dựng',
  'Thuế tỉnh',
  'Công an tỉnh (PCCC)',
  'Bảo hiểm xã hội tỉnh',
  'UBND xã sở tại',
  'Công ty mẹ / Cổ đông',
  'Nhà thầu',
  'Nhà cung cấp',
  'Ngân hàng',
  'Khác',
];

// i18n-data
// People come only from Settings → Personnel: no names are suggested until they are configured
export const DEFAULT_PERSONNEL: Array<{ name: string; department?: string }> = [];

// i18n-data
export const DEFAULT_URGENCY_LEVELS = ['Thường', 'Khẩn', 'Thượng khẩn', 'Hỏa tốc'];
// i18n-data
export const DEFAULT_SECURITY_LEVELS = ['Thường', 'Hạn chế (nội bộ)', 'Mật', 'Tối mật', 'Tuyệt mật'];
// i18n-data
export const DEFAULT_STORAGE_TYPES = ['Gốc', 'Bản sao (Copy)', 'Bản scan điện tử'];
// i18n-data
export const DEFAULT_CONTRACT_STATUSES = ['Dự thảo', 'Trình duyệt', 'Đã ký', 'Đang thực hiện', 'Tạm dừng', 'Thanh lý', 'Hủy'];
// i18n-data
export const DEFAULT_SEND_METHODS = [
  'Giao trực tiếp',
  'Bưu điện',
  'Chuyển phát nhanh',
  'Email công vụ',
  'Cổng dịch vụ công / Trục liên thông',
  'Fax',
];
// i18n-data
export const DEFAULT_OUTGOING_STATUSES = ['Dự thảo', 'Trình ký', 'Đã ký - chờ gửi', 'Đã gửi', 'Hủy'];
// i18n-data
export const DEFAULT_PARTIES_A = [
  'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII',
  'Chi nhánh Công ty Cổ phần đầu tư quốc tế Sambo Gold tại Sơn La',
  'Ban Quản lý Dự án Khai thác Khoáng sản SGII',
  'Công ty TNHH Đầu tư & Phát triển Mỏ Tây Bắc',
];

// i18n-data
export const DEFAULT_LABOR_CONTRACT_TYPES = [
  'Hợp đồng lao động xác định thời hạn (12 - 36 tháng)',
  'Hợp đồng lao động không xác định thời hạn',
  'Hợp đồng thử việc (Probation Contract)',
  'Phụ lục điều chỉnh lương & chế độ đãi ngộ (Mật)',
  'Hợp đồng chuyên gia / Cố vấn cấp cao (Mật)',
];

// i18n-data: recipient values and document-number format examples
export const DEFAULT_RECIPIENTS = ['Toàn công ty', 'Ban Giám đốc'];
// i18n-data
export const LABOR_NUMBER_EXAMPLE = '01/2026/HĐLĐ-SGII';
// i18n-data
export const CONTRACT_NUMBER_EXAMPLE = '01/2026/HĐ-DV, 25/2026/HĐ-MB';
// i18n-data
export const REPLY_NUMBER_EXAMPLE = 'ĐẾN-2026-0001, 1520/SNNMT';
