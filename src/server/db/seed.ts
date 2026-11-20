import type { DocumentRecord, ContractRecord } from '../types.ts';
import excelContracts from './excel_contracts.json';
import excelDocuments from './excel_documents.json';
const samplePptxDocuments: DocumentRecord[] = [
  {
    id: 'doc-thads-02',
    document_number: '02/QĐ-THADS',
    title: 'Quy trình thủ tục thi hành án dân sự (THADS)',
    doc_type: 'decision',
    doc_category: 'Quyết định',
    issuer: 'Tổng cục Thi hành án Dân sự',
    signer: 'Nguyễn Văn Tuấn',
    department: 'Pháp chế - Đối ngoại',
    handler: 'Nguyễn Văn Tuấn',
    issue_date: '2026-10-15',
    received_date: '2026-10-16',
    due_date: '2026-10-30',
    urgency_level: 'Khẩn',
    security_level: 'Thường',
    status: 'Đang xử lý',
    summary: 'Tài liệu tập huấn quy trình, trình tự và thủ tục thi hành án dân sự theo Luật THADS: từ tiếp nhận đơn yêu cầu, ra quyết định thi hành án đến tổ chức cưỡng chế thi hành án.',
    tags: 'THADS, thủ tục, quy trình, thi hành án, tập huấn',
    file_key: 'samples/02_Quy_trinh_thu_tuc_THADS.pptx',
    file_name: '02_Quy_trinh_thu_tuc_THADS.pptx',
    file_size: 194392,
    file_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    created_at: '2026-10-16 08:30:00',
    updated_at: '2026-10-16 08:30:00',
  },
  {
    id: 'doc-thads-03',
    document_number: '03/HD-TDNH',
    title: 'Chuyên đề Thi hành án dân sự liên quan đến tổ chức tín dụng, ngân hàng',
    doc_type: 'internal',
    doc_category: 'Hướng dẫn',
    issuer: 'Cục THADS TP. Hồ Chí Minh',
    signer: 'Trần Thị Mai',
    department: 'Tài chính - Kế toán',
    handler: 'Trần Thị Mai',
    issue_date: '2026-10-18',
    received_date: '2026-10-18',
    due_date: '2026-11-05',
    urgency_level: 'Thường',
    security_level: 'Hạn chế (nội bộ)',
    status: 'Đang xử lý',
    summary: 'Hướng dẫn thực hiện các biện pháp giải quyết án tín dụng ngân hàng, xử lý tài sản bảo đảm thế chấp, giải quyết vướng mắc thực tiễn thu hồi nợ xấu cho các TCTD.',
    tags: 'ngân hàng, tín dụng, THADS, tài sản bảo đảm, nợ xấu',
    file_key: 'samples/03_THADS_tin_dung_ngan_hang.pptx',
    file_name: '03_THADS_tin_dung_ngan_hang.pptx',
    file_size: 189313,
    file_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    created_at: '2026-10-18 09:15:00',
    updated_at: '2026-10-18 09:15:00',
  },
  {
    id: 'doc-thads-04',
    document_number: '04/CT-CCTH',
    title: 'Cưỡng chế thi hành án dân sự đối với tài sản của tổ chức tín dụng',
    doc_type: 'internal',
    doc_category: 'Chỉ thị',
    issuer: 'Ban Chỉ đạo Thi hành án Dân sự',
    signer: 'Lê Hoàng Quân',
    department: 'An toàn - Sức khỏe - Môi trường',
    handler: 'Đinh Văn Tiến',
    issue_date: '2026-10-20',
    received_date: '2026-10-21',
    due_date: '2026-11-01',
    urgency_level: 'Thượng khẩn',
    security_level: 'Mật',
    status: 'Đang xử lý',
    summary: 'Quy định chi tiết và quy trình cưỡng chế kê biên, phong tỏa tài khoản, xử lý tài sản bảo đảm của tổ chức tín dụng và khách hàng vay vốn theo bản án có hiệu lực pháp luật.',
    tags: 'cưỡng chế, kê biên, tài sản, TCTD, xử lý nợ',
    file_key: 'samples/04_Cuong_che_THADS_TCTD.pptx',
    file_name: '04_Cuong_che_THADS_TCTD.pptx',
    file_size: 213023,
    file_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    created_at: '2026-10-21 14:00:00',
    updated_at: '2026-10-21 14:00:00',
  },
];

export const initialDocuments: DocumentRecord[] = [
  ...samplePptxDocuments,
  ...(excelDocuments as unknown as DocumentRecord[]),
];
import excelPartners from './excel_partners.json';
import type { PartnerRecord } from '../types.ts';

export const initialContracts: ContractRecord[] = [
  ...(excelContracts as unknown as ContractRecord[]),
];

export const initialPartners: PartnerRecord[] = [
  ...(excelPartners as unknown as PartnerRecord[]),
];


