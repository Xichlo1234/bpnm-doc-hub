import React, { useState, useEffect } from 'react';
import { X, FileCheck, ArrowDownLeft, ArrowUpRight, Sparkles, Building2, UploadCloud, Link2, Paperclip, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { api } from '../services/api.ts';
import { canAccessLaborContracts, type ContractType, type PartnerRecord } from '../../../server/types.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { seedLabel, statusLabel, urgencyLabel } from '../i18n/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  getNormalizedDocTypes,
  getNormalizedDepartments,
  getUnifiedContractDepartments,
  getUnifiedContractTypes,
} from '../utils/categoryHelpers.ts';

// Default Master Categories Fallbacks (Ensures no dropdown is ever empty)
// i18n-data
const DEFAULT_DOC_TYPES = [
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
const DEFAULT_CONTRACT_TYPES = [
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
const DEFAULT_CONTRACT_DEPTS = [
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
const DEFAULT_DEPARTMENTS = [
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
const DEFAULT_AGENCIES = [
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
const DEFAULT_PERSONNEL = [
  { name: 'Nguyễn Văn Thành', department: 'Ban Giám đốc' },
  { name: 'Lê Thị Ngọc Hoan', department: 'Hành chính - Nhân sự' },
  { name: 'Trần Thị Thu Trang', department: 'Hành chính - Nhân sự' },
  { name: 'Nguyễn Thị Ngọc', department: 'Tài chính - Kế toán' },
  { name: 'Nguyễn Thị Linh', department: 'An toàn - Sức khỏe - Môi trường' },
  { name: 'Đinh Văn Tiến', department: 'Pháp chế - Đối ngoại' },
  { name: 'Trần Anh Sơn', department: 'Hạ tầng - Facilities' },
  { name: 'Vũ Minh Dự', department: 'Môi trường - Env' },
  { name: 'Ngô Thị Lan', department: 'Mua sắm - Kho' },
];

// i18n-data
const DEFAULT_URGENCY_LEVELS = ['Thường', 'Khẩn', 'Thượng khẩn', 'Hỏa tốc'];
// i18n-data
const DEFAULT_SECURITY_LEVELS = ['Thường', 'Hạn chế (nội bộ)', 'Mật', 'Tối mật', 'Tuyệt mật'];
// i18n-data
const DEFAULT_STORAGE_TYPES = ['Gốc', 'Bản sao (Copy)', 'Bản scan điện tử'];
// i18n-data
const DEFAULT_CONTRACT_STATUSES = ['Dự thảo', 'Trình duyệt', 'Đã ký', 'Đang thực hiện', 'Tạm dừng', 'Thanh lý', 'Hủy'];
// i18n-data
const DEFAULT_SEND_METHODS = [
  'Giao trực tiếp',
  'Bưu điện',
  'Chuyển phát nhanh',
  'Email công vụ',
  'Cổng dịch vụ công / Trục liên thông',
  'Fax',
];
// i18n-data
const DEFAULT_OUTGOING_STATUSES = ['Dự thảo', 'Trình ký', 'Đã ký - chờ gửi', 'Đã gửi', 'Hủy'];
// i18n-data
const DEFAULT_PARTIES_A = [
  'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII',
  'Chi nhánh Công ty Cổ phần đầu tư quốc tế Sambo Gold tại Sơn La',
  'Ban Quản lý Dự án Khai thác Khoáng sản SGII',
  'Công ty TNHH Đầu tư & Phát triển Mỏ Tây Bắc',
];

// i18n-data
const DEFAULT_LABOR_CONTRACT_TYPES = [
  'Hợp đồng lao động xác định thời hạn (12 - 36 tháng)',
  'Hợp đồng lao động không xác định thời hạn',
  'Hợp đồng thử việc (Probation Contract)',
  'Phụ lục điều chỉnh lương & chế độ đãi ngộ (Mật)',
  'Hợp đồng chuyên gia / Cố vấn cấp cao (Mật)',
];

// i18n-data: recipient values and document-number format examples
const DEFAULT_RECIPIENTS = ['Toàn công ty', 'Ban Giám đốc'];
// i18n-data
const LABOR_NUMBER_EXAMPLE = '01/2026/HĐLĐ-SGII';
// i18n-data
const CONTRACT_NUMBER_EXAMPLE = '01/2026/HĐ-DV, 25/2026/HĐ-MB';
// i18n-data
const REPLY_NUMBER_EXAMPLE = 'ĐẾN-2026-0001, 1520/SNNMT';

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultTab?: 'contract' | 'labor' | 'incoming' | 'outgoing';
}

export const CreateModal: React.FC<CreateModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  defaultTab = 'contract',
}) => {
  const { language, t, tf } = useLanguage();

  // The server reserves numbers atomically; tell the user when theirs was taken in the meantime
  const notifyReassigned = (created: any) => {
    if (created?.number_reassigned) {
      window.alert(tf('numberReassigned', { requested: created.requested_number, number: created.document_number }));
    }
  };
  const { user } = useAuth();
  const canViewLabor = canAccessLaborContracts(user);
  const [tab, setTab] = useState<'contract' | 'labor' | 'incoming' | 'outgoing'>(defaultTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<any>(null);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  // i18n-data: fallback currency records until settings load
  const [currencyList, setCurrencyList] = useState<any[]>([
    { code: 'USD', name: 'Đô la Mỹ ($)' },
    { code: 'KHR', name: 'Riel Campuchia (៛)' },
    { code: 'VND', name: 'Việt Nam Đồng (₫)' },
    { code: 'EUR', name: 'Euro (€)' },
  ]);

  // Contract form fields
  const [contractNumber, setContractNumber] = useState('');
  const [contractTitle, setContractTitle] = useState('');
  const [contractCategory, setContractCategory] = useState(DEFAULT_CONTRACT_TYPES[0]);
  const [contractType, setContractType] = useState<ContractType>('service');
  const [selectedPartyA, setSelectedPartyA] = useState(DEFAULT_PARTIES_A[0]);
  const [isCustomPartyA, setIsCustomPartyA] = useState(false);
  const [partyA, setPartyA] = useState(DEFAULT_PARTIES_A[0]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [isCustomPartner, setIsCustomPartner] = useState(false);
  const [partyB, setPartyB] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [partnerTaxId, setPartnerTaxId] = useState('');
  const [partnerContact, setPartnerContact] = useState('');
  const [contractDepartment, setContractDepartment] = useState(DEFAULT_CONTRACT_DEPTS[0]);
  const [contractValue, setContractValue] = useState('');
  const [currency, setCurrency] = useState('VND');
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [contractStatus, setContractStatus] = useState('Đang thực hiện'); // i18n-data
  const [contractStorageType, setContractStorageType] = useState('Gốc'); // i18n-data
  const [contractStorageLocation, setContractStorageLocation] = useState('Tủ HC-01 / Kệ 2026'); // i18n-data
  const [renewalTerms, setRenewalTerms] = useState('');

  // Incoming Document form fields
  const [incomingDocNumber, setIncomingDocNumber] = useState('');
  const [incomingOrigNumber, setIncomingOrigNumber] = useState('');
  const [incomingTitle, setIncomingTitle] = useState('');
  const [incomingCategory, setIncomingCategory] = useState('Công văn'); // i18n-data
  const [selectedIncomingIssuer, setSelectedIncomingIssuer] = useState(DEFAULT_AGENCIES[0]);
  const [isCustomIncomingIssuer, setIsCustomIncomingIssuer] = useState(false);
  const [incomingIssuer, setIncomingIssuer] = useState(DEFAULT_AGENCIES[0]);
  const [incomingDepartment, setIncomingDepartment] = useState('Ban Giám đốc'); // i18n-data
  const [selectedIncomingHandler, setSelectedIncomingHandler] = useState('Nguyễn Văn Thành'); // i18n-data
  const [isCustomIncomingHandler, setIsCustomIncomingHandler] = useState(false);
  const [incomingHandler, setIncomingHandler] = useState('Nguyễn Văn Thành'); // i18n-data
  const [incomingReceiveDate, setIncomingReceiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [incomingIssueDate, setIncomingIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [incomingDueDate, setIncomingDueDate] = useState('');
  const [incomingUrgency, setIncomingUrgency] = useState('Thường'); // i18n-data
  const [incomingSecurity, setIncomingSecurity] = useState('Thường'); // i18n-data
  const [incomingDirective, setIncomingDirective] = useState('');
  const [incomingStorageType, setIncomingStorageType] = useState('Gốc'); // i18n-data
  const [incomingStorageLocation, setIncomingStorageLocation] = useState('Tủ HC-01 / Kệ 2026'); // i18n-data

  // Outgoing Document form fields
  const [outgoingDocNumber, setOutgoingDocNumber] = useState('');
  const [outgoingTitle, setOutgoingTitle] = useState('');
  const [outgoingCategory, setOutgoingCategory] = useState('Công văn'); // i18n-data
  const [outgoingCategoryCode, setOutgoingCategoryCode] = useState('CV');
  const [outgoingDepartment, setOutgoingDepartment] = useState('Hành chính - Nhân sự'); // i18n-data
  const [outgoingDeptCode, setOutgoingDeptCode] = useState('HCNS');
  const [selectedOutgoingHandler, setSelectedOutgoingHandler] = useState('Lê Thị Ngọc Hoan'); // i18n-data
  const [isCustomOutgoingHandler, setIsCustomOutgoingHandler] = useState(false);
  const [outgoingHandler, setOutgoingHandler] = useState('Lê Thị Ngọc Hoan'); // i18n-data
  const [selectedOutgoingSigner, setSelectedOutgoingSigner] = useState('Nguyễn Văn Thành'); // i18n-data
  const [isCustomOutgoingSigner, setIsCustomOutgoingSigner] = useState(false);
  const [outgoingSigner, setOutgoingSigner] = useState('Nguyễn Văn Thành'); // i18n-data
  const [selectedOutgoingRecipient, setSelectedOutgoingRecipient] = useState('Toàn công ty'); // i18n-data
  const [isCustomOutgoingRecipient, setIsCustomOutgoingRecipient] = useState(false);
  const [outgoingRecipient, setOutgoingRecipient] = useState('Toàn công ty'); // i18n-data
  const [outgoingIssueDate, setOutgoingIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedLinkedDoc, setSelectedLinkedDoc] = useState('');
  const [isCustomLinkedDoc, setIsCustomLinkedDoc] = useState(false);
  const [outgoingLinkedDoc, setOutgoingLinkedDoc] = useState('');
  const [outgoingSendMethod, setOutgoingSendMethod] = useState('Cổng dịch vụ công / Trục liên thông'); // i18n-data
  // A new outgoing document starts as a draft; it is issued through the workflow
  const [outgoingStatus, setOutgoingStatus] = useState('Dự thảo'); // i18n-data
  const [outgoingUrgency, setOutgoingUrgency] = useState('Thường'); // i18n-data
  const [outgoingSecurity, setOutgoingSecurity] = useState('Thường'); // i18n-data
  const [outgoingStorageType, setOutgoingStorageType] = useState('Gốc'); // i18n-data
  const [outgoingStorageLocation, setOutgoingStorageLocation] = useState('Tủ HC-02 / Kệ 2026'); // i18n-data

  // Existing documents list for linking outgoing to incoming
  const [incomingDocsList, setIncomingDocsList] = useState<any[]>([]);

  // Attached file & cloud link states (Default: 'upload' for direct file attachment)
  const [contractAttachMode, setContractAttachMode] = useState<'upload' | 'link'>('upload');
  const [contractCloudLink, setContractCloudLink] = useState('');

  const [incomingAttachMode, setIncomingAttachMode] = useState<'upload' | 'link'>('upload');
  const [incomingCloudLink, setIncomingCloudLink] = useState('');

  const [outgoingAttachMode, setOutgoingAttachMode] = useState<'upload' | 'link'>('upload');
  const [outgoingCloudLink, setOutgoingCloudLink] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);

  useEffect(() => {
    setTab(defaultTab);
    if (defaultTab === 'labor') {
      setContractType('labor');
      setContractCategory(DEFAULT_LABOR_CONTRACT_TYPES[0]);
      setContractDepartment('HR - Nhan su');
      setContractStorageLocation('Tủ NS-MẬT / Kệ HĐLĐ-2026'); // i18n-data
    } else if (defaultTab === 'contract') {
      setContractType('service');
      setContractCategory(DEFAULT_CONTRACT_TYPES[0]);
      setContractStorageLocation('Tủ HC-01 / Kệ 2026'); // i18n-data
    }
    setSelectedFile(null);
    setUploadProgress(0);
    setIsUploadingFile(false);
    setUploadError('');
    setUploadSuccess(false);
  }, [defaultTab, isOpen]);

  // Load categories, partners and auto-generate next numbers
  useEffect(() => {
    if (!isOpen) return;

    Promise.all([
      api.getCategories().catch(err => {
        console.error('Error fetching categories:', err);
        return null;
      }),
      api.getPartners().catch(err => {
        console.error('Error fetching partners:', err);
        return [];
      }),
      api.getDocuments().catch(err => {
        console.error('Error fetching documents:', err);
        return [];
      }),
      api.getCurrencies().catch(() => []),
    ]).then(([cats, pts, docs, currs]) => {
      if (currs && currs.length > 0) {
        setCurrencyList(currs);
      }
      if (cats) {
        setCategories(cats);
        if (cats.agencies && cats.agencies.length > 0 && !incomingIssuer) {
          setIncomingIssuer(cats.agencies[0]);
          setSelectedIncomingIssuer(cats.agencies[0]);
        }
      }
      if (pts && Array.isArray(pts)) {
        setPartners(pts);
      }
      if (docs && Array.isArray(docs)) {
        setIncomingDocsList(docs.filter((d: any) => d.doc_type === 'incoming' || !d.doc_type || d.doc_type === 'decision'));
      }
    });

    // Auto-fetch next incoming number
    api.getNextDocNumber('incoming').then(res => {
      setIncomingDocNumber(res.nextNumber);
    }).catch(console.error);

    // Auto-fetch next outgoing number
    api.getNextDocNumber('outgoing', outgoingCategoryCode, outgoingDeptCode).then(res => {
      setOutgoingDocNumber(res.nextNumber);
    }).catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    setUploadSuccess(false);
    setUploadProgress(0);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        setUploadError(tf('uploadTooLargeSaveViaDrive', { name: file.name, size: (file.size / (1024 * 1024)).toFixed(2) }));
        setSelectedFile(null);
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
    }
  };

  // Re-generate auto-numbers
  const regenerateIncomingNumber = async () => {
    try {
      const res = await api.getNextDocNumber('incoming');
      setIncomingDocNumber(res.nextNumber);
    } catch (err) {
      console.error(err);
    }
  };

  const regenerateOutgoingNumber = async (catCode = outgoingCategoryCode, deptCode = outgoingDeptCode) => {
    try {
      const res = await api.getNextDocNumber('outgoing', catCode, deptCode);
      setOutgoingDocNumber(res.nextNumber);
    } catch (err) {
      console.error(err);
    }
  };

  // Party A selection handler
  const handlePartyAChange = (val: string) => {
    setSelectedPartyA(val);
    if (val === '__custom__') {
      setIsCustomPartyA(true);
      setPartyA('');
    } else {
      setIsCustomPartyA(false);
      setPartyA(val);
    }
  };

  // Partner selection handler for Bên B
  const handlePartnerChange = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    if (partnerId === '__custom__') {
      setIsCustomPartner(true);
      setPartyB('');
      setPartnerCode('');
      setPartnerTaxId('');
      setPartnerContact('');
      return;
    }
    setIsCustomPartner(false);
    if (!partnerId) {
      setPartyB('');
      setPartnerCode('');
      setPartnerTaxId('');
      setPartnerContact('');
      return;
    }
    const found = partners.find(p => p.id === partnerId);
    if (found) {
      setPartyB(found.name_vn);
      setPartnerCode(found.code || '');
      setPartnerTaxId(found.tax_id || '');
      const contactStr = [found.contact_person, found.representative, found.contact].filter(Boolean).join(' - ');
      setPartnerContact(contactStr);
    }
  };

  // Contract Type mapping from Category
  const handleContractCategoryChange = (category: string) => {
    setContractCategory(category);
    if (tab === 'labor') {
      setContractType('labor');
      return;
    }
    const catLower = category.toLowerCase();
    if (catLower.includes('thue') || catLower.includes('lease')) {
      setContractType('lease');
    } else if (catLower.includes('cung cap') || catLower.includes('supply') || catLower.includes('mua sam')) {
      setContractType('procurement');
    } else if (catLower.includes('hợp đồng lao động') || catLower.includes('hđlđ')) {
      setContractType('labor');
    } else if (catLower.includes('bao mat') || catLower.includes('nda')) {
      setContractType('nda');
    } else if (catLower.includes('khac') || catLower.includes('other')) {
      setContractType('other');
    } else {
      setContractType('service');
    }
  };

  // Outgoing Category Change with code & numbering sync
  const handleOutgoingCategoryChange = (catName: string) => {
    setOutgoingCategory(catName);
    const docTypes = getNormalizedDocTypes(categories, DEFAULT_DOC_TYPES);
    const found = docTypes.find((t) => t.name === catName);
    const code = found && found.code ? found.code : 'CV';
    setOutgoingCategoryCode(code);
    regenerateOutgoingNumber(code, outgoingDeptCode);
  };

  // Outgoing Dept Change with code & numbering sync
  const handleOutgoingDepartmentChange = (deptName: string) => {
    setOutgoingDepartment(deptName);
    const depts = getNormalizedDepartments(categories, DEFAULT_DEPARTMENTS);
    const found = depts.find((d) => d.name === deptName);
    const code = found && found.code ? found.code : 'HCNS';
    setOutgoingDeptCode(code);
    regenerateOutgoingNumber(outgoingCategoryCode, code);
  };

  // Incoming Issuer selection handler
  const handleIncomingIssuerChange = (val: string) => {
    setSelectedIncomingIssuer(val);
    if (val === '__custom__') {
      setIsCustomIncomingIssuer(true);
      setIncomingIssuer('');
    } else {
      setIsCustomIncomingIssuer(false);
      setIncomingIssuer(val);
    }
  };

  // Incoming Handler selection handler
  const handleIncomingHandlerChange = (val: string) => {
    setSelectedIncomingHandler(val);
    if (val === '__custom__') {
      setIsCustomIncomingHandler(true);
      setIncomingHandler('');
    } else {
      setIsCustomIncomingHandler(false);
      setIncomingHandler(val);
    }
  };

  // Outgoing Recipient selection handler
  const handleOutgoingRecipientChange = (val: string) => {
    setSelectedOutgoingRecipient(val);
    if (val === '__custom__') {
      setIsCustomOutgoingRecipient(true);
      setOutgoingRecipient('');
    } else {
      setIsCustomOutgoingRecipient(false);
      setOutgoingRecipient(val);
    }
  };

  // Outgoing Handler selection handler
  const handleOutgoingHandlerChange = (val: string) => {
    setSelectedOutgoingHandler(val);
    if (val === '__custom__') {
      setIsCustomOutgoingHandler(true);
      setOutgoingHandler('');
    } else {
      setIsCustomOutgoingHandler(false);
      setOutgoingHandler(val);
    }
  };

  // Outgoing Signer selection handler
  const handleOutgoingSignerChange = (val: string) => {
    setSelectedOutgoingSigner(val);
    if (val === '__custom__') {
      setIsCustomOutgoingSigner(true);
      setOutgoingSigner('');
    } else {
      setIsCustomOutgoingSigner(false);
      setOutgoingSigner(val);
    }
  };

  // Outgoing Linked Doc selection handler
  const handleLinkedDocChange = (val: string) => {
    setSelectedLinkedDoc(val);
    if (val === '__custom__') {
      setIsCustomLinkedDoc(true);
      setOutgoingLinkedDoc('');
    } else if (val === '') {
      setIsCustomLinkedDoc(false);
      setOutgoingLinkedDoc('');
    } else {
      setIsCustomLinkedDoc(false);
      setOutgoingLinkedDoc(val);
    }
  };

  // SUBMIT HANDLERS
  const handleContractSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNumber || !contractTitle || !partyA || !partyB || !signedDate || !startDate) {
      alert(t.requiredFieldsAlert);
      return;
    }

    setIsSubmitting(true);
    try {
      const fullStorage = `${contractStorageType} (${contractStorageLocation})`;
      const formData = new FormData();
      formData.append('contract_number', contractNumber);
      formData.append('title', contractTitle);
      formData.append('contract_type', tab === 'labor' ? 'labor' : contractType);
      formData.append(
        'contract_category',
        tab === 'labor'
          ? contractCategory.toLowerCase().includes('lao động')
            ? contractCategory
            : `Hợp đồng lao động - ${contractCategory}` // i18n-data
          : contractCategory
      );
      formData.append('party_a', partyA);
      formData.append('party_b', partyB);
      formData.append('partner_code', partnerCode);
      formData.append('partner_tax_id', partnerTaxId);
      formData.append('partner_contact', partnerContact);
      formData.append('department', contractDepartment);
      formData.append('value', contractValue || '0');
      formData.append('currency', currency);
      formData.append('signed_date', signedDate);
      formData.append('start_date', startDate);
      if (endDate) formData.append('end_date', endDate);
      formData.append('status', contractStatus === 'Thanh lý' ? 'liquidated' : contractStatus === 'Hủy' ? 'terminated' : 'active');
      formData.append('status_raw', contractStatus);
      formData.append('storage_location', fullStorage);
      formData.append('renewal_terms', renewalTerms);
      if (contractAttachMode === 'upload' && selectedFile) {
        formData.append('file', selectedFile);
        setIsUploadingFile(true);
        setUploadProgress(10);
      } else if (contractAttachMode === 'link' && contractCloudLink.trim()) {
        formData.append('google_drive_url', contractCloudLink.trim());
      }

      await api.createContract(formData, (percent) => {
        setUploadProgress(percent);
      });
      setUploadSuccess(true);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 400);
    } catch (err: any) {
      const msg = err.message || String(err);
      setUploadError(msg);
      alert(tf('createContractFailed', { error: msg }));
    } finally {
      setIsSubmitting(false);
      setIsUploadingFile(false);
    }
  };

  const handleIncomingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalIssuer = (isCustomIncomingIssuer ? incomingIssuer : (incomingIssuer || selectedIncomingIssuer)).trim();
    const finalHandler = (isCustomIncomingHandler ? incomingHandler : (incomingHandler || selectedIncomingHandler)).trim();

    if (!incomingDocNumber || !incomingTitle || !incomingIssueDate || !finalIssuer) {
      alert(t.requiredFieldsAlert);
      return;
    }

    setIsSubmitting(true);
    setUploadError('');
    try {
      const fullStorage = `${incomingStorageType} (${incomingStorageLocation})`;
      const docPayload: Record<string, any> = {
        document_number: incomingDocNumber,
        original_doc_number: incomingOrigNumber || null,
        title: incomingTitle,
        doc_type: incomingCategory === 'Quyết định' ? 'decision' : 'incoming',
        doc_category: incomingCategory,
        issuer: finalIssuer || 'Cơ quan bên ngoài', // i18n-data
        department: incomingDepartment,
        handler: finalHandler,
        issue_date: incomingIssueDate,
        received_date: incomingReceiveDate,
        due_date: incomingDueDate || null,
        urgency_level: incomingUrgency,
        security_level: incomingSecurity,
        directive: incomingDirective || null,
        storage_location: fullStorage,
        status: finalHandler ? 'Đã phân công' : 'Chưa phân công', // i18n-data
        summary: incomingTitle,
        tags: `${incomingCategory}, ${finalIssuer}, ${incomingDepartment}`,
      };

      if (incomingAttachMode === 'upload' && selectedFile) {
        const formData = new FormData();
        Object.entries(docPayload).forEach(([k, v]) => {
          if (v !== null && v !== undefined) formData.append(k, String(v));
        });
        formData.append('file', selectedFile);
        setIsUploadingFile(true);
        setUploadProgress(10);
        notifyReassigned(
          await api.createDocument(formData, (percent) => {
            setUploadProgress(percent);
          })
        );
      } else {
        if (incomingAttachMode === 'link' && incomingCloudLink.trim()) {
          docPayload.google_drive_url = incomingCloudLink.trim();
        }
        notifyReassigned(await api.createDocument(docPayload));
      }

      setUploadSuccess(true);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 400);
    } catch (err: any) {
      const msg = err.message || String(err);
      setUploadError(msg);
      alert(tf('receiveDocumentFailed', { error: msg }));
    } finally {
      setIsSubmitting(false);
      setIsUploadingFile(false);
    }
  };

  const handleOutgoingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalRecipient = (isCustomOutgoingRecipient ? outgoingRecipient : (outgoingRecipient || selectedOutgoingRecipient)).trim();
    const finalHandler = (isCustomOutgoingHandler ? outgoingHandler : (outgoingHandler || selectedOutgoingHandler)).trim();
    const finalSigner = (isCustomOutgoingSigner ? outgoingSigner : (outgoingSigner || selectedOutgoingSigner)).trim();
    const finalLinkedDoc = (isCustomLinkedDoc ? outgoingLinkedDoc : (outgoingLinkedDoc || selectedLinkedDoc)).trim();

    if (!outgoingDocNumber || !outgoingTitle || !outgoingIssueDate || !finalRecipient) {
      alert(t.requiredFieldsAlert);
      return;
    }

    setIsSubmitting(true);
    setUploadError('');
    try {
      const fullStorage = `${outgoingStorageType} (${outgoingStorageLocation})`;
      const docPayload: Record<string, any> = {
        document_number: outgoingDocNumber,
        title: outgoingTitle,
        doc_type: 'outgoing',
        doc_category: outgoingCategory,
        issuer: 'SGII - Công ty Cổ phần', // i18n-data
        recipient: finalRecipient || 'Toàn công ty', // i18n-data
        signer: finalSigner,
        department: outgoingDepartment,
        handler: finalHandler,
        issue_date: outgoingIssueDate,
        received_date: outgoingIssueDate,
        urgency_level: outgoingUrgency,
        security_level: outgoingSecurity,
        linked_doc_number: finalLinkedDoc || null,
        send_method: outgoingSendMethod,
        status: outgoingStatus,
        storage_location: fullStorage,
        summary: outgoingTitle,
        tags: `${outgoingCategory}, ${outgoingDepartment}, ${finalRecipient}`,
      };

      if (outgoingAttachMode === 'upload' && selectedFile) {
        const formData = new FormData();
        Object.entries(docPayload).forEach(([k, v]) => {
          if (v !== null && v !== undefined) formData.append(k, String(v));
        });
        formData.append('file', selectedFile);
        setIsUploadingFile(true);
        setUploadProgress(10);
        notifyReassigned(
          await api.createDocument(formData, (percent) => {
            setUploadProgress(percent);
          })
        );
      } else {
        if (outgoingAttachMode === 'link' && outgoingCloudLink.trim()) {
          docPayload.google_drive_url = outgoingCloudLink.trim();
        }
        notifyReassigned(await api.createDocument(docPayload));
      }

      setUploadSuccess(true);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 400);
    } catch (err: any) {
      const msg = err.message || String(err);
      setUploadError(msg);
      alert(tf('issueDocumentFailed', { error: msg }));
    } finally {
      setIsSubmitting(false);
      setIsUploadingFile(false);
    }
  };

  // Safe & unified category lists
  const docTypesList = getNormalizedDocTypes(categories, DEFAULT_DOC_TYPES);
  const contractTypesList = getUnifiedContractTypes(
    categories,
    DEFAULT_CONTRACT_TYPES,
    DEFAULT_DOC_TYPES,
    contractCategory
  );
  const contractDeptsList = getUnifiedContractDepartments(
    categories,
    DEFAULT_CONTRACT_DEPTS,
    DEFAULT_DEPARTMENTS,
    contractDepartment
  );
  const departmentsList = getNormalizedDepartments(categories, DEFAULT_DEPARTMENTS);
  const agenciesList = categories?.agencies || DEFAULT_AGENCIES;
  const personnelList = categories?.personnel || DEFAULT_PERSONNEL;
  const urgencyLevelsList = categories?.urgency_levels || DEFAULT_URGENCY_LEVELS;
  const securityLevelsList = categories?.security_levels || DEFAULT_SECURITY_LEVELS;
  const storageTypesList = categories?.storage_types || DEFAULT_STORAGE_TYPES;
  const storageLocationsList: string[] = Array.isArray(categories?.storage_locations)
    ? categories.storage_locations
    : [];
  const sendMethodsList = categories?.send_methods || DEFAULT_SEND_METHODS;
  const outgoingStatusesList = categories?.outgoing_statuses || DEFAULT_OUTGOING_STATUSES;
  const contractStatusesList = categories?.contract_statuses || DEFAULT_CONTRACT_STATUSES;
  const partiesAList = categories?.parties_a || DEFAULT_PARTIES_A;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content modal-structured"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 740, width: '95%' }}
      >
        {/* Pinned Modal Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {tab === 'contract'
                ? t.createContractTitle
                : tab === 'labor'
                ? t.createLaborTitle
                : tab === 'incoming'
                ? t.createIncomingTitle
                : t.createOutgoingTitle}
            </h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
              {tab === 'contract'
                ? t.createContractDesc
                : tab === 'labor'
                ? t.createLaborDesc
                : tab === 'incoming'
                ? t.createIncomingDesc
                : t.createOutgoingDesc}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button" title={t.close}>
            <X size={18} />
          </button>
        </div>

        {/* Pinned Tab Bar */}
        <div className="modal-tabs-nav">
          <button
            type="button"
            className={`btn ${tab === 'contract' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => {
              setTab('contract');
              setContractType('service');
              setContractCategory(DEFAULT_CONTRACT_TYPES[0]);
            }}
          >
            <FileCheck size={15} style={{ marginRight: 6 }} />
            {t.contractTab}
          </button>
          {canViewLabor && (
            <button
              type="button"
              className={`btn ${tab === 'labor' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                fontSize: 13,
                padding: '7px 14px',
                borderRadius: 8,
                background: tab === 'labor' ? '#B45309' : undefined,
                borderColor: tab === 'labor' ? '#B45309' : undefined,
                color: tab === 'labor' ? '#fff' : '#F59E0B',
              }}
              onClick={() => {
                setTab('labor');
                setContractType('labor');
                setContractCategory(DEFAULT_LABOR_CONTRACT_TYPES[0]);
                setContractDepartment('HR - Nhan su');
                setContractStorageLocation('Tủ NS-MẬT / Kệ HĐLĐ-2026'); // i18n-data
              }}
            >
              <Lock size={14} style={{ marginRight: 6 }} />
              {t.laborTabLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn ${tab === 'incoming' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => setTab('incoming')}
          >
            <ArrowDownLeft size={15} style={{ marginRight: 6 }} />
            {t.incomingTab}
          </button>
          <button
            type="button"
            className={`btn ${tab === 'outgoing' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => setTab('outgoing')}
          >
            <ArrowUpRight size={15} style={{ marginRight: 6 }} />
            {t.outgoingTab}
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="modal-scroll-body">
          {/* TAB 1 & TAB LABOR: HỢP ĐỒNG KINH TẾ / HỢP ĐỒNG LAO ĐỘNG */}
          {(tab === 'contract' || tab === 'labor') && (
            <form id="contract-form" onSubmit={handleContractSubmit}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1.2 }}>
                  <label className="form-label">
                    {tab === 'labor' ? t.laborContractNumberLabel : t.contractNumberLabel} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input mono-code"
                    placeholder={tf('examplePlaceholder', { example: tab === 'labor' ? LABOR_NUMBER_EXAMPLE : CONTRACT_NUMBER_EXAMPLE })}
                    value={contractNumber}
                    onChange={e => setContractNumber(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1.8 }}>
                  <label className="form-label">
                    {tab === 'labor'
                      ? tf('laborContractTypeCount', { count: DEFAULT_LABOR_CONTRACT_TYPES.length })
                      : tf('contractCategoryCount', { count: contractTypesList.length })}
                  </label>
                  <select
                    className="form-select"
                    value={contractCategory}
                    onChange={e => handleContractCategoryChange(e.target.value)}
                  >
                    {(tab === 'labor' ? DEFAULT_LABOR_CONTRACT_TYPES : contractTypesList).map((ct: any) => {
                      const name = typeof ct === 'string' ? ct : ct.name;
                      return (
                        <option key={name} value={name}>
                          {seedLabel(language, name)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {tab === 'labor' ? t.laborTitleLabel : t.contractTitleLabel} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder={
                    tab === 'labor'
                      ? t.laborTitlePlaceholder
                      : t.contractTitlePlaceholder
                  }
                  value={contractTitle}
                  onChange={e => setContractTitle(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      {tab === 'labor' ? t.laborPartyALabel : t.contractPartyALabel} <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {tf('legalEntitiesCount', { count: partiesAList.length })}
                    </span>
                  </div>
                  <select
                    className="form-select"
                    value={selectedPartyA}
                    onChange={e => handlePartyAChange(e.target.value)}
                  >
                    {partiesAList.map((pa: string) => (
                      <option key={pa} value={pa}>
                        {pa}
                      </option>
                    ))}
                    <option value="__custom__">{t.enterOtherEntity}</option>
                  </select>
                  {isCustomPartyA && (
                    <input
                      type="text"
                      required
                      className="form-input"
                      style={{ marginTop: 6 }}
                      placeholder={t.newPartyAPlaceholder}
                      value={partyA}
                      onChange={e => setPartyA(e.target.value)}
                    />
                  )}
                </div>

                <div className="form-group">
                  {tab === 'labor' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          {t.laborPartyBLabel} <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        required
                        className="form-input"
                        list="labor-personnel-list"
                        placeholder={t.employeeNamePlaceholder}
                        value={partyB}
                        onChange={e => setPartyB(e.target.value)}
                      />
                      <datalist id="labor-personnel-list">
                        {personnelList.map((p: any) => {
                          const name = typeof p === 'string' ? p : p.name;
                          return <option key={name} value={name} />;
                        })}
                      </datalist>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          {t.contractPartyBLabel} <span style={{ color: '#EF4444' }}>*</span>
                        </label>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {tf('partnersCount', { count: partners.length })}
                        </span>
                      </div>
                      <select
                        className="form-select"
                        required
                        value={selectedPartnerId}
                        onChange={e => handlePartnerChange(e.target.value)}
                      >
                        <option value="">{tf('selectPartnerOption', { count: partners.length })}</option>
                        {partners.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.code ? `[${p.code}] ` : ''}{p.name_vn} {p.tax_id ? `(MST: ${p.tax_id})` : ''}
                          </option>
                        ))}
                        <option value="__custom__">{t.enterNewPartner}</option>
                      </select>
                      {isCustomPartner && (
                        <input
                          type="text"
                          required
                          className="form-input"
                          style={{ marginTop: 6 }}
                          placeholder={t.newPartnerPlaceholder}
                          value={partyB}
                          onChange={e => setPartyB(e.target.value)}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {tab === 'labor' ? t.employeeIdLabel : t.partnerTaxIdLabel}
                  </label>
                  <input
                    type="text"
                    className="form-input mono-code"
                    placeholder={tab === 'labor' ? 'VD: NV-0125 / CCCD: 001090xxxxxx...' : 'VD: 0100109106...'}
                    value={partnerTaxId}
                    onChange={e => setPartnerTaxId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {tab === 'labor' ? t.employeeContactLabel : t.partnerRepresentativeLabel}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={tab === 'labor' ? t.employeeContactPlaceholder : t.partnerContactPlaceholder}
                    value={partnerContact}
                    onChange={e => setPartnerContact(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{tf('departmentsCountLabel', { count: contractDeptsList.length })}</label>
                  <select
                    className="form-select"
                    value={contractDepartment}
                    onChange={e => setContractDepartment(e.target.value)}
                  >
                    {contractDeptsList.map((dept: string) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.contractStatusLabel}</label>
                  <select
                    className="form-select"
                    value={contractStatus}
                    onChange={e => setContractStatus(e.target.value)}
                  >
                    {contractStatusesList.map((st: string) => (
                      <option key={st} value={st}>
                        {statusLabel(t, st)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1.5 }}>
                  <label className="form-label">
                    {tab === 'labor' ? t.laborSalaryLabel : t.contractValueLabel}
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder={tab === 'labor' ? 'VD: 35000000' : 'VD: 150000000'}
                    value={contractValue}
                    onChange={e => setContractValue(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 0.6 }}>
                  <label className="form-label">{t.currencyLabel}</label>
                  <select
                    className="form-select"
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                  >
                    {currencyList.map((c: any) => (
                      <option key={c.code} value={c.code}>
                        {c.code} {c.name ? `(${c.name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">
                    {t.signedDateLabel} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={signedDate}
                    onChange={e => setSignedDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {t.effectiveDateLabel} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {t.expiryDateLabel} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.emptyIfIndefinite}</span>
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t.storageTypeLabel}</label>
                  <select
                    className="form-select"
                    value={contractStorageType}
                    onChange={e => setContractStorageType(e.target.value)}
                  >
                    {storageTypesList.map((st: string) => (
                      <option key={st} value={st}>
                        {seedLabel(language, st)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1.5 }}>
                  <label className="form-label">{t.physicalLocationLabel}</label>
                  <input
                    type="text"
                    className="form-input"
                    list="create-storage-locations-list"
                    placeholder={t.contractLocationPlaceholder}
                    value={contractStorageLocation}
                    onChange={e => setContractStorageLocation(e.target.value)}
                  />
                  <datalist id="create-storage-locations-list">
                    {storageLocationsList.map((loc: string) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t.renewalNotesLabel}</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder={t.renewalNotesPlaceholder}
                  value={renewalTerms}
                  onChange={e => setRenewalTerms(e.target.value)}
                />
              </div>

              {/* Tệp đính kèm hoặc Link Cloud */}
              <div className="form-group" style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                    {t.contractAttachmentSection}
                  </label>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 3, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => setContractAttachMode('link')}
                      style={{
                        border: 'none',
                        background: contractAttachMode === 'link' ? 'var(--accent-primary)' : 'transparent',
                        color: contractAttachMode === 'link' ? '#fff' : 'var(--text-secondary)',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Link2 size={12} /> {t.pasteDriveLinkMode}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContractAttachMode('upload')}
                      style={{
                        border: 'none',
                        background: contractAttachMode === 'upload' ? 'var(--accent-primary)' : 'transparent',
                        color: contractAttachMode === 'upload' ? '#fff' : 'var(--text-secondary)',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <UploadCloud size={12} /> {t.uploadFileMode}
                    </button>
                  </div>
                </div>

                {contractAttachMode === 'upload' ? (
                  <div>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
                      onChange={handleFileChange}
                      className="form-input"
                      style={{ padding: '6px' }}
                    />
                    {selectedFile && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600 }}>
                        <Paperclip size={13} />
                        <span>{tf('selectedFileInfo', { name: selectedFile.name, size: (selectedFile.size / 1024).toFixed(1) })}</span>
                      </div>
                    )}
                    {/* Real-time Progress Bar & Instant Error UI */}
                    {uploadError && (
                      <div className="upload-progress-box has-error">
                        <div className="upload-error-text">
                          <AlertCircle size={15} style={{ flexShrink: 0 }} />
                          <span>{uploadError}</span>
                        </div>
                      </div>
                    )}

                    {isUploadingFile && (
                      <div className="upload-progress-box">
                        <div className="upload-progress-header">
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {tf('uploadingFileName', { name: selectedFile?.name ?? '' })}
                          </span>
                          <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {uploadProgress}%
                          </span>
                        </div>
                        <div className="upload-progress-track">
                          <div
                            className="upload-progress-bar is-animated"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {uploadSuccess && (
                      <div className="upload-progress-box is-success">
                        <div className="upload-success-text">
                          <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                          <span>{t.uploadAndSaveSuccess}</span>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t.supportedFileTypes}
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      placeholder={t.cloudLinkInputPlaceholder}
                      value={contractCloudLink}
                      onChange={e => setContractCloudLink(e.target.value)}
                      className="form-input"
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t.cloudLinkHint}
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}

          {/* TAB 2: CÔNG VĂN ĐẾN */}
          {tab === 'incoming' && (
            <form id="incoming-form" onSubmit={handleIncomingSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      {t.incomingNumberLabel} <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '2px 8px', height: 24, color: '#D97706' }}
                      onClick={regenerateIncomingNumber}
                      title={t.autoNumberTooltip}
                    >
                      <Sparkles size={12} style={{ marginRight: 4 }} /> {t.autoNumberBtn}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    className="form-input mono-code"
                    value={incomingDocNumber}
                    onChange={e => setIncomingDocNumber(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t.originalDocNumberLabel}</label>
                  <input
                    type="text"
                    className="form-input mono-code"
                    placeholder="VD: 1520/SNNMT-MT, 2210/CAT-PC07..."
                    value={incomingOrigNumber}
                    onChange={e => setIncomingOrigNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t.docTitleCol} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  className="form-textarea"
                  placeholder={t.incomingTitlePlaceholder}
                  value={incomingTitle}
                  onChange={e => setIncomingTitle(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {tf('docTypeCountLabel', { count: docTypesList.length })} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    className="form-select"
                    value={incomingCategory}
                    onChange={e => setIncomingCategory(e.target.value)}
                  >
                    {docTypesList.map((dt: any) => (
                      <option key={dt.code || dt.name} value={dt.name}>
                        {seedLabel(language, dt.name)} ({dt.code || ''})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    {tf('senderAgencyCountLabel', { count: agenciesList.length })} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    className="form-select"
                    value={selectedIncomingIssuer}
                    onChange={e => handleIncomingIssuerChange(e.target.value)}
                  >
                    <optgroup label={t.stateAgenciesGroup}>
                      {agenciesList.map((a: string) => (
                        <option key={a} value={a}>
                          {seedLabel(language, a)}
                        </option>
                      ))}
                    </optgroup>
                    {partners.length > 0 && (
                      <optgroup label={t.partnersFromDirectoryGroup}>
                        {partners.slice(0, 15).map((p: any) => (
                          <option key={`partner-${p.id}`} value={p.name_vn}>
                            {p.name_vn}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="__custom__">{t.enterOtherAgency}</option>
                  </select>
                  {isCustomIncomingIssuer && (
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder={t.newAgencyPlaceholder}
                      style={{ marginTop: 8 }}
                      value={incomingIssuer}
                      onChange={e => setIncomingIssuer(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {tf('receivingDeptCountLabel', { count: departmentsList.length })} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    className="form-select"
                    value={incomingDepartment}
                    onChange={e => setIncomingDepartment(e.target.value)}
                  >
                    {departmentsList.map((d: any) => (
                      <option key={d.code || d.name} value={d.name}>
                        {seedLabel(language, d.name)} {d.code ? `(${d.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t.assignedHandlerLabel}</label>
                  <select
                    className="form-select"
                    value={selectedIncomingHandler}
                    onChange={e => handleIncomingHandlerChange(e.target.value)}
                  >
                    <option value="">{t.unassignedOption}</option>
                    {personnelList.map((p: any) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({seedLabel(language, p.department)})
                      </option>
                    ))}
                    <option value="__custom__">{t.enterOtherStaff}</option>
                  </select>
                  {isCustomIncomingHandler && (
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t.newHandlerPlaceholder}
                      style={{ marginTop: 8 }}
                      value={incomingHandler}
                      onChange={e => setIncomingHandler(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {t.documentDateLabel} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={incomingIssueDate}
                    onChange={e => setIncomingIssueDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {t.receivedDateLabel} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={incomingReceiveDate}
                    onChange={e => setIncomingReceiveDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ color: '#EF4444' }}>
                    {t.deadlineFormLabel}
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={incomingDueDate}
                    onChange={e => setIncomingDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t.docUrgencyCol}</label>
                  <select
                    className="form-select"
                    value={incomingUrgency}
                    onChange={e => setIncomingUrgency(e.target.value)}
                  >
                    {urgencyLevelsList.map((u: string) => (
                      <option key={u} value={u}>
                        {urgencyLabel(t, u)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t.securityLevelLabel}</label>
                  <select
                    className="form-select"
                    value={incomingSecurity}
                    onChange={e => setIncomingSecurity(e.target.value)}
                  >
                    {securityLevelsList.map((s: string) => (
                      <option key={s} value={s}>
                        {seedLabel(language, s)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t.storageTypeLabel}</label>
                  <select
                    className="form-select"
                    value={incomingStorageType}
                    onChange={e => setIncomingStorageType(e.target.value)}
                  >
                    {storageTypesList.map((st: string) => (
                      <option key={st} value={st}>
                        {seedLabel(language, st)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t.originalCopyLocationLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  list="create-storage-locations-list"
                  placeholder={t.incomingLocationPlaceholder}
                  value={incomingStorageLocation}
                  onChange={e => setIncomingStorageLocation(e.target.value)}
                />
                <datalist id="create-storage-locations-list">
                  {storageLocationsList.map((loc: string) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>

              {/* Directive */}
              <div className="form-group">
                <label className="form-label" style={{ color: '#D97706', fontWeight: 600 }}>
                  {t.boardDirectiveLabel}
                </label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder={t.incomingDirectivePlaceholder}
                  value={incomingDirective}
                  onChange={e => setIncomingDirective(e.target.value)}
                />
              </div>

              {/* Tệp đính kèm hoặc Link Cloud */}
              <div className="form-group" style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                    {t.incomingAttachmentSection}
                  </label>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 3, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => setIncomingAttachMode('link')}
                      style={{
                        border: 'none',
                        background: incomingAttachMode === 'link' ? 'var(--accent-primary)' : 'transparent',
                        color: incomingAttachMode === 'link' ? '#fff' : 'var(--text-secondary)',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Link2 size={12} /> {t.pasteDriveLinkMode}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncomingAttachMode('upload')}
                      style={{
                        border: 'none',
                        background: incomingAttachMode === 'upload' ? 'var(--accent-primary)' : 'transparent',
                        color: incomingAttachMode === 'upload' ? '#fff' : 'var(--text-secondary)',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <UploadCloud size={12} /> {t.uploadFileMode}
                    </button>
                  </div>
                </div>

                {incomingAttachMode === 'upload' ? (
                  <div>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
                      onChange={handleFileChange}
                      className="form-input"
                      style={{ padding: '6px' }}
                    />
                    {selectedFile && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600 }}>
                        <Paperclip size={13} />
                        <span>{tf('selectedFileInfo', { name: selectedFile.name, size: (selectedFile.size / 1024).toFixed(1) })}</span>
                      </div>
                    )}
                    {/* Real-time Progress Bar & Instant Error UI */}
                    {uploadError && (
                      <div className="upload-progress-box has-error">
                        <div className="upload-error-text">
                          <AlertCircle size={15} style={{ flexShrink: 0 }} />
                          <span>{uploadError}</span>
                        </div>
                      </div>
                    )}

                    {isUploadingFile && (
                      <div className="upload-progress-box">
                        <div className="upload-progress-header">
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {tf('uploadingFileName', { name: selectedFile?.name ?? '' })}
                          </span>
                          <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {uploadProgress}%
                          </span>
                        </div>
                        <div className="upload-progress-track">
                          <div
                            className="upload-progress-bar is-animated"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {uploadSuccess && (
                      <div className="upload-progress-box is-success">
                        <div className="upload-success-text">
                          <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                          <span>{t.uploadAndSaveSuccess}</span>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t.supportedFileTypes}
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      placeholder={t.cloudLinkInputPlaceholder}
                      value={incomingCloudLink}
                      onChange={e => setIncomingCloudLink(e.target.value)}
                      className="form-input"
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t.cloudLinkHint}
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}

          {/* TAB 3: CÔNG VĂN ĐI */}
          {tab === 'outgoing' && (
            <form id="outgoing-form" onSubmit={handleOutgoingSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      {t.autoOutgoingNumberLabel} <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '2px 8px', height: 24, color: '#D97706' }}
                      onClick={() => regenerateOutgoingNumber()}
                      title={t.autoOutgoingNumberTooltip}
                    >
                      <Sparkles size={12} style={{ marginRight: 4 }} /> {t.autoOutgoingNumberBtn}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    className="form-input mono-code"
                    value={outgoingDocNumber}
                    onChange={e => setOutgoingDocNumber(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{tf('docTypeCountLabel', { count: docTypesList.length })}</label>
                  <select
                    className="form-select"
                    value={outgoingCategory}
                    onChange={e => handleOutgoingCategoryChange(e.target.value)}
                  >
                    {docTypesList.map((dt: any) => (
                      <option key={dt.code || dt.name} value={dt.name}>
                        {seedLabel(language, dt.name)} ({dt.code || ''})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t.docTitleCol} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  className="form-textarea"
                  placeholder={t.outgoingTitlePlaceholder}
                  value={outgoingTitle}
                  onChange={e => setOutgoingTitle(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{tf('draftingDeptCountLabel', { count: departmentsList.length })}</label>
                  <select
                    className="form-select"
                    value={outgoingDepartment}
                    onChange={e => handleOutgoingDepartmentChange(e.target.value)}
                  >
                    {departmentsList.map((d: any) => (
                      <option key={d.code || d.name} value={d.name}>
                        {seedLabel(language, d.name)} {d.code ? `(${d.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    {t.docRecipientCol} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    className="form-select"
                    value={selectedOutgoingRecipient}
                    onChange={e => handleOutgoingRecipientChange(e.target.value)}
                  >
                    <optgroup label={t.internalCompanyGroup}>
                      {DEFAULT_RECIPIENTS.map((r) => (
                        <option key={r} value={r}>
                          {seedLabel(language, r)}
                        </option>
                      ))}
                      {departmentsList.map((d: any) => (
                        <option key={`out-dept-${d.code || d.name}`} value={d.name}>
                          {seedLabel(language, d.name)} {d.code ? `(${d.code})` : ''}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t.stateAgenciesGroup}>
                      {agenciesList.map((a: string) => (
                        <option key={`out-agency-${a}`} value={a}>
                          {seedLabel(language, a)}
                        </option>
                      ))}
                    </optgroup>
                    {partners.length > 0 && (
                      <optgroup label={t.partnersAndCustomersGroup}>
                        {partners.slice(0, 15).map((p: any) => (
                          <option key={`out-partner-${p.id}`} value={p.name_vn}>
                            {p.name_vn}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="__custom__">{t.enterOtherRecipient}</option>
                  </select>
                  {isCustomOutgoingRecipient && (
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder={t.newRecipientPlaceholder}
                      style={{ marginTop: 8 }}
                      value={outgoingRecipient}
                      onChange={e => setOutgoingRecipient(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t.drafterLabel}</label>
                  <select
                    className="form-select"
                    value={selectedOutgoingHandler}
                    onChange={e => handleOutgoingHandlerChange(e.target.value)}
                  >
                    {personnelList.map((p: any) => (
                      <option key={`out-handler-${p.name}`} value={p.name}>
                        {p.name} ({seedLabel(language, p.department)})
                      </option>
                    ))}
                    <option value="__custom__">{t.enterOtherDrafter}</option>
                  </select>
                  {isCustomOutgoingHandler && (
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t.newDrafterPlaceholder}
                      style={{ marginTop: 8 }}
                      value={outgoingHandler}
                      onChange={e => setOutgoingHandler(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">{t.approverLabel}</label>
                  <select
                    className="form-select"
                    value={selectedOutgoingSigner}
                    onChange={e => handleOutgoingSignerChange(e.target.value)}
                  >
                    {personnelList.map((p: any) => (
                      <option key={`out-signer-${p.name}`} value={p.name}>
                        {p.name} ({seedLabel(language, p.department)})
                      </option>
                    ))}
                    <option value="__custom__">{t.enterOtherSigner}</option>
                  </select>
                  {isCustomOutgoingSigner && (
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t.newSignerPlaceholder}
                      style={{ marginTop: 8 }}
                      value={outgoingSigner}
                      onChange={e => setOutgoingSigner(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    {t.issueDateLabel} <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={outgoingIssueDate}
                    onChange={e => setOutgoingIssueDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.sendMethodLabel}</label>
                  <select
                    className="form-select"
                    value={outgoingSendMethod}
                    onChange={e => setOutgoingSendMethod(e.target.value)}
                  >
                    {sendMethodsList.map((m: string) => (
                      <option key={m} value={m}>
                        {seedLabel(language, m)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.issueStatusLabel}</label>
                  <select
                    className="form-select"
                    value={outgoingStatus}
                    onChange={e => setOutgoingStatus(e.target.value)}
                  >
                    {outgoingStatusesList.map((st: string) => (
                      <option key={st} value={st}>
                        {statusLabel(t, st)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t.docUrgencyCol}</label>
                  <select
                    className="form-select"
                    value={outgoingUrgency}
                    onChange={e => setOutgoingUrgency(e.target.value)}
                  >
                    {urgencyLevelsList.map((u: string) => (
                      <option key={u} value={u}>
                        {urgencyLabel(t, u)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t.securityLevelLabel}</label>
                  <select
                    className="form-select"
                    value={outgoingSecurity}
                    onChange={e => setOutgoingSecurity(e.target.value)}
                  >
                    {securityLevelsList.map((s: string) => (
                      <option key={s} value={s}>
                        {seedLabel(language, s)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t.storageTypeLabel}</label>
                  <select
                    className="form-select"
                    value={outgoingStorageType}
                    onChange={e => setOutgoingStorageType(e.target.value)}
                  >
                    {storageTypesList.map((st: string) => (
                      <option key={st} value={st}>
                        {seedLabel(language, st)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Linked Doc & Storage Location */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" style={{ color: '#2563EB' }}>
                    {t.replyToIncomingLabel}
                  </label>
                  <select
                    className="form-select"
                    value={selectedLinkedDoc}
                    onChange={e => handleLinkedDocChange(e.target.value)}
                  >
                    <option value="">{t.standaloneDocOption}</option>
                    {incomingDocsList.map((doc: any) => (
                      <option key={`link-${doc.id || doc.document_number}`} value={doc.document_number}>
                        [{doc.document_number}] {doc.title?.length > 40 ? doc.title.slice(0, 40) + '...' : doc.title}
                      </option>
                    ))}
                    <option value="__custom__">{t.enterOtherDocNumber}</option>
                  </select>
                  {isCustomLinkedDoc && (
                    <input
                      type="text"
                      className="form-input mono-code"
                      placeholder={tf('examplePlaceholder', { example: REPLY_NUMBER_EXAMPLE })}
                      style={{ marginTop: 8 }}
                      value={outgoingLinkedDoc}
                      onChange={e => setOutgoingLinkedDoc(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">{t.physicalLocationLabel}</label>
                  <input
                    type="text"
                    className="form-input"
                    list="create-storage-locations-list"
                    placeholder={t.outgoingLocationPlaceholder}
                    value={outgoingStorageLocation}
                    onChange={e => setOutgoingStorageLocation(e.target.value)}
                  />
                  <datalist id="create-storage-locations-list">
                    {storageLocationsList.map((loc: string) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Tệp đính kèm hoặc Link Cloud */}
              <div className="form-group" style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                    {t.outgoingAttachmentSection}
                  </label>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 3, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                    <button
                      type="button"
                      onClick={() => setOutgoingAttachMode('link')}
                      style={{
                        border: 'none',
                        background: outgoingAttachMode === 'link' ? 'var(--accent-primary)' : 'transparent',
                        color: outgoingAttachMode === 'link' ? '#fff' : 'var(--text-secondary)',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Link2 size={12} /> {t.pasteDriveLinkMode}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutgoingAttachMode('upload')}
                      style={{
                        border: 'none',
                        background: outgoingAttachMode === 'upload' ? 'var(--accent-primary)' : 'transparent',
                        color: outgoingAttachMode === 'upload' ? '#fff' : 'var(--text-secondary)',
                        borderRadius: 4,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <UploadCloud size={12} /> {t.uploadFileMode}
                    </button>
                  </div>
                </div>

                {outgoingAttachMode === 'upload' ? (
                  <div>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
                      onChange={handleFileChange}
                      className="form-input"
                      style={{ padding: '6px' }}
                    />
                    {selectedFile && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600 }}>
                        <Paperclip size={13} />
                        <span>{tf('selectedFileInfo', { name: selectedFile.name, size: (selectedFile.size / 1024).toFixed(1) })}</span>
                      </div>
                    )}
                    {/* Real-time Progress Bar & Instant Error UI */}
                    {uploadError && (
                      <div className="upload-progress-box has-error">
                        <div className="upload-error-text">
                          <AlertCircle size={15} style={{ flexShrink: 0 }} />
                          <span>{uploadError}</span>
                        </div>
                      </div>
                    )}

                    {isUploadingFile && (
                      <div className="upload-progress-box">
                        <div className="upload-progress-header">
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {tf('uploadingFileName', { name: selectedFile?.name ?? '' })}
                          </span>
                          <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {uploadProgress}%
                          </span>
                        </div>
                        <div className="upload-progress-track">
                          <div
                            className="upload-progress-bar is-animated"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {uploadSuccess && (
                      <div className="upload-progress-box is-success">
                        <div className="upload-success-text">
                          <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                          <span>{t.uploadAndSaveSuccess}</span>
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t.supportedFileTypes}
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="url"
                      placeholder={t.cloudLinkInputPlaceholder}
                      value={outgoingCloudLink}
                      onChange={e => setOutgoingCloudLink(e.target.value)}
                      className="form-input"
                      style={{ width: '100%' }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t.cloudLinkHint}
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Pinned Modal Footer Actions */}
        <div className="modal-footer-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            {t.cancel}
          </button>
          <button
            type="submit"
            form={
              tab === 'contract' || tab === 'labor'
                ? 'contract-form'
                : tab === 'incoming'
                ? 'incoming-form'
                : 'outgoing-form'
            }
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{ minWidth: 140 }}
          >
            {isSubmitting
              ? t.saving
              : tab === 'contract'
              ? t.saveContractBtn
              : tab === 'labor'
              ? t.saveLaborBtn
              : tab === 'incoming'
              ? t.receiveAndLogBtn
              : t.issueAndLogBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
