import type { Language } from './index.ts';

/**
 * Display labels for the default (seeded) category values. The stored value stays Vietnamese;
 * categories created by users have no entry and are shown as stored.
 * Khmer entries are machine-drafted and still need review by a Khmer speaker.
 */
export const SEED_LABELS: Record<string, { en: string; km: string }> = {
  // Doc types
  'Công văn': { en: 'Official Letter (Công văn)', km: 'លិខិតផ្លូវការ' },
  'Văn bản hành chính giao dịch chính thức': { en: 'Official administrative correspondence', km: 'លិខិតរដ្ឋបាលផ្លូវការ' },
  'Quyết định': { en: 'Decision (Quyết định)', km: 'សេចក្តីសម្រេច' },
  'Quyết định ban hành nội bộ hoặc từ cơ quan NN': { en: 'Internal or state agency decision', km: 'សេចក្តីសម្រេចផ្ទៃក្នុង ឬពីស្ថាប័នរដ្ឋ' },
  'Tờ trình': { en: 'Proposal / Submission (Tờ trình)', km: 'របាយការណ៍ស្នើសុំ' },
  'Tờ trình xin phê duyệt chủ trương, ngân sách': { en: 'Proposal for policy or budget approval', km: 'សំណើសុំអនុម័តគោលនយោបាយ ឬថវិកា' },
  'Thông báo': { en: 'Announcement / Notice (Thông báo)', km: 'សេចក្តីជូនដំណឹង' },
  'Thông báo nội bộ hoặc từ cơ quan quản lý': { en: 'Internal or regulatory agency notice', km: 'សេចក្តីជូនដំណឹងផ្ទៃក្នុង ឬពីស្ថាប័នគ្រប់គ្រង' },
  'Báo cáo': { en: 'Report (Báo cáo)', km: 'របាយការណ៍' },
  'Báo cáo tiến độ, định kỳ, chuyên đề': { en: 'Progress, periodic, or thematic report', km: 'របាយការណ៍វឌ្ឍនភាព ប្រចាំកាល ឬតាមប្រធានបទ' },
  'Biên bản': { en: 'Minutes / Memorandum (Biên bản)', km: 'កំណត់ហេតុ' },
  'Biên bản họp, nghiệm thu, làm việc': { en: 'Meeting, acceptance, or working minutes', km: 'កំណត់ហេតុប្រជុំ ទទួលយកការងារ ឬការងារ' },
  'Giấy ủy quyền': { en: 'Power of Attorney (Giấy ủy quyền)', km: 'លិខិតប្រគល់សិទ្ធិ' },
  'Ủy quyền đại diện pháp lý, giao dịch': { en: 'Legal representation or transaction authorization', km: 'ការប្រគល់សិទ្ធិតំណាងផ្លូវច្បាប់ ឬប្រតិបត្តិការ' },
  'Hợp đồng': { en: 'Contract (Hợp đồng)', km: 'កិច្ចសន្យា' },
  'Hợp đồng kinh tế, thương mại, dịch vụ': { en: 'Economic, commercial, or service contract', km: 'កិច្ចសន្យាសេដ្ឋកិច្ច ពាណិជ្ជកម្ម ឬសេវាកម្ម' },
  'Phụ lục HĐ': { en: 'Contract Addendum (Phụ lục HĐ)', km: 'ឧបសម្ព័ន្ធកិច្ចសន្យា' },
  'Phụ lục điều chỉnh, gia hạn hợp đồng': { en: 'Contract amendment or extension addendum', km: 'ឧបសម្ព័ន្ធកែប្រែ ឬបន្តកិច្ចសន្យា' },
  'Biên bản Thanh lý': { en: 'Liquidation Minutes (Biên bản Thanh lý)', km: 'កំណត់ហេតុទូទាត់បញ្ចប់' },
  'Biên bản thanh lý và đóng hợp đồng': { en: 'Contract liquidation and closure minutes', km: 'កំណត់ហេតុទូទាត់ និងបិទកិច្ចសន្យា' },
  'Đề nghị Thanh toán': { en: 'Payment Request (Đề nghị Thanh toán)', km: 'សំណើទូទាត់ប្រាក់' },
  'Hồ sơ đề nghị thanh toán, tạm ứng': { en: 'Payment or advance request dossier', km: 'ឯកសារស្នើទូទាត់ ឬបុរេប្រទាន' },
  // Departments
  'Ban Giám đốc': { en: 'Board of Directors (Ban Giám đốc)', km: 'គណៈនាយក' },
  'Tài chính - Kế toán': { en: 'Finance & Accounting (Tài chính - Kế toán)', km: 'ហិរញ្ញវត្ថុ និងគណនេយ្យ' },
  'Hành chính - Nhân sự': { en: 'HR & Administration (Hành chính - Nhân sự)', km: 'រដ្ឋបាល និងធនធានមនុស្ស' },
  'Kế hoạch - Đầu tư': { en: 'Planning & Investment (Kế hoạch - Đầu tư)', km: 'ផែនការ និងវិនិយោគ' },
  'Pháp chế - Tuân thủ': { en: 'Legal & Compliance (Pháp chế - Tuân thủ)', km: 'នីតិកម្ម និងអនុលោមភាព' },
  'Kỹ thuật - Xây dựng': { en: 'Engineering & Construction (Kỹ thuật - Xây dựng)', km: 'បច្ចេកទេស និងសំណង់' },
  'Mua sắm - Đấu thầu': { en: 'Procurement & Bidding (Mua sắm - Đấu thầu)', km: 'លទ្ធកម្ម និងការដេញថ្លៃ' },
  'Kinh doanh - Thương mại': { en: 'Sales & Commercial (Kinh doanh - Thương mại)', km: 'អាជីវកម្ម និងពាណិជ្ជកម្ម' },
  'Vận hành - Khai thác': { en: 'Operations (Vận hành - Khai thác)', km: 'ប្រតិបត្តិការ' },
  'Công nghệ thông tin': { en: 'Information Technology (CNTT)', km: 'បច្ចេកវិទ្យាព័ត៌មាន' },
  'An ninh - An toàn': { en: 'Security & Safety (An ninh - An toàn)', km: 'សន្តិសុខ និងសុវត្ថិភាព' },
  'Đối ngoại - Truyền thông': { en: 'External Relations & PR (Đối ngoại)', km: 'ទំនាក់ទំនងខាងក្រៅ និងផ្សព្វផ្សាយ' },
  'Trợ lý Chủ tịch': { en: 'Chairman Assistant (Trợ lý Chủ tịch)', km: 'ជំនួយការប្រធាន' },
  'Ban kiểm soát nội bộ': { en: 'Internal Audit Board (Ban kiểm soát nội bộ)', km: 'គណៈកម្មការសវនកម្មផ្ទៃក្នុង' },
  'Ban quản lý Dự án': { en: 'Project Management Board (Ban quản lý Dự án)', km: 'គណៈគ្រប់គ្រងគម្រោង' },
  // Roles
  'Chuyên viên': { en: 'Specialist', km: 'មន្ត្រីជំនាញ' },
  // Partner categories
  'Nhà thầu thi công': { en: 'Construction contractor', km: 'អ្នកម៉ៅការសំណង់' },
  'Nhà cung cấp vật tư / thiết bị': { en: 'Materials / equipment supplier', km: 'អ្នកផ្គត់ផ្គង់សម្ភារៈ / ឧបករណ៍' },
  'Dịch vụ kỹ thuật & bảo trì': { en: 'Technical & maintenance services', km: 'សេវាបច្ចេកទេស និងថែទាំ' },
  'Khách hàng / Chủ đầu tư': { en: 'Customer / Investor', km: 'អតិថិជន / ម្ចាស់វិនិយោគ' },
  'Cơ quan quản lý / Đối tác chiến lược': { en: 'Regulator / Strategic partner', km: 'ស្ថាប័នគ្រប់គ្រង / ដៃគូយុទ្ធសាស្ត្រ' },
  'Tư vấn & Kiểm định': { en: 'Consulting & Inspection', km: 'ការប្រឹក្សា និងការត្រួតពិនិត្យ' },
  'Khác': { en: 'Other', km: 'ផ្សេងៗ' },
  // Doc types (form defaults)
  'Kế hoạch': { en: 'Plan', km: 'ផែនការ' },
  'Giấy mời': { en: 'Invitation', km: 'លិខិតអញ្ជើញ' },
  'Hợp đồng / Phụ lục': { en: 'Contract / Annex', km: 'កិច្ចសន្យា / ឧបសម្ព័ន្ធ' },
  'Giấy phép / Chấp thuận': { en: 'Permit / Approval', km: 'អាជ្ញាប័ណ្ណ / ការអនុញ្ញាត' },
  'Thư / Email chính thức': { en: 'Official letter / Email', km: 'លិខិត / អ៊ីមែលផ្លូវការ' },
  // Departments (form defaults)
  'An toàn - Sức khỏe - Môi trường': { en: 'Health, Safety & Environment', km: 'សុវត្ថិភាព សុខភាព និងបរិស្ថាន' },
  'Khai thác': { en: 'Mining', km: 'ការជីកយករ៉ែ' },
  'Chế biến': { en: 'Processing', km: 'ការកែច្នៃ' },
  'Cơ điện - Bảo trì': { en: 'Mechanical & Electrical - Maintenance', km: 'មេកានិច អគ្គិសនី - ថែទាំ' },
  'Hạ tầng - Facilities': { en: 'Facilities', km: 'ហេដ្ឋារចនាសម្ព័ន្ធ' },
  'Pháp chế - Đối ngoại': { en: 'Legal & External Affairs', km: 'នីតិកម្ម និងកិច្ចការខាងក្រៅ' },
  'Mua sắm - Kho': { en: 'Procurement & Warehouse', km: 'លទ្ធកម្ម និងឃ្លាំង' },
  'Thăm do - Địa chất': { en: 'Exploration & Geology', km: 'ការរុករក និងភូគព្ភសាស្ត្រ' },
  // Recipients
  'Toàn công ty': { en: 'Whole company', km: 'ក្រុមហ៊ុនទាំងមូល' },
  // Security levels
  'Thường': { en: 'Normal', km: 'ធម្មតា' },
  'Hạn chế (nội bộ)': { en: 'Restricted (internal)', km: 'កម្រិត (ផ្ទៃក្នុង)' },
  'Mật': { en: 'Confidential', km: 'សម្ងាត់' },
  'Tối mật': { en: 'Secret', km: 'សម្ងាត់ខ្លាំង' },
  'Tuyệt mật': { en: 'Top secret', km: 'សម្ងាត់បំផុត' },
  // Storage types
  'Gốc': { en: 'Original', km: 'ច្បាប់ដើម' },
  'Bản sao (Copy)': { en: 'Copy', km: 'ច្បាប់ចម្លង' },
  'Bản scan điện tử': { en: 'Electronic scan', km: 'ច្បាប់ស្កេនអេឡិចត្រូនិច' },
  // Send methods
  'Giao trực tiếp': { en: 'Hand delivery', km: 'ប្រគល់ផ្ទាល់' },
  'Bưu điện': { en: 'Post', km: 'ប្រៃសណីយ៍' },
  'Chuyển phát nhanh': { en: 'Express courier', km: 'សេវាដឹកជញ្ជូនរហ័ស' },
  'Email công vụ': { en: 'Official email', km: 'អ៊ីមែលផ្លូវការ' },
  'Cổng dịch vụ công / Trục liên thông': { en: 'Public service portal / Interlinked system', km: 'វិបផតថលសេវាសាធារណៈ / ប្រព័ន្ធតភ្ជាប់' },
  // Labor contract types
  'Hợp đồng lao động xác định thời hạn (12 - 36 tháng)': { en: 'Fixed-term labor contract (12 - 36 months)', km: 'កិច្ចសន្យាការងារមានកំណត់ (១២ - ៣៦ ខែ)' },
  'Hợp đồng lao động không xác định thời hạn': { en: 'Indefinite-term labor contract', km: 'កិច្ចសន្យាការងារគ្មានកំណត់' },
  'Hợp đồng thử việc (Probation Contract)': { en: 'Probation contract', km: 'កិច្ចសន្យាសាកល្បងការងារ' },
  'Phụ lục điều chỉnh lương & chế độ đãi ngộ (Mật)': { en: 'Salary & benefits adjustment annex (Confidential)', km: 'ឧបសម្ព័ន្ធកែតម្រូវប្រាក់ខែ និងអត្ថប្រយោជន៍ (សម្ងាត់)' },
  'Hợp đồng chuyên gia / Cố vấn cấp cao (Mật)': { en: 'Expert / Senior advisor contract (Confidential)', km: 'កិច្ចសន្យាអ្នកជំនាញ / ទីប្រឹក្សាជាន់ខ្ពស់ (សម្ងាត់)' },
};

export function seedLabel(language: Language, value?: string | null): string {
  if (!value) return '';
  if (language === 'vi') return value;
  return SEED_LABELS[value]?.[language] ?? value;
}
