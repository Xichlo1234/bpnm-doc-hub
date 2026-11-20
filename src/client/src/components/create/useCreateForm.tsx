import React, { useState, useEffect } from 'react';
import { notify } from '../../context/ToastContext.tsx';
import { X, FileCheck, ArrowDownLeft, ArrowUpRight, Sparkles, Building2, UploadCloud, Link2, Paperclip, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { api } from '../../services/api.ts';
import { canAccessLaborContracts, type ContractType, type PartnerRecord } from '../../../../server/types.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { seedLabel, statusLabel, urgencyLabel } from '../../i18n/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  getNormalizedDocTypes,
  getNormalizedDepartments,
  getUnifiedContractDepartments,
  getUnifiedContractTypes,
} from '../../utils/categoryHelpers.ts';
import { DEFAULT_DOC_TYPES, DEFAULT_CONTRACT_TYPES, DEFAULT_CONTRACT_DEPTS, DEFAULT_DEPARTMENTS, DEFAULT_AGENCIES, DEFAULT_PERSONNEL, DEFAULT_URGENCY_LEVELS, DEFAULT_SECURITY_LEVELS, DEFAULT_STORAGE_TYPES, DEFAULT_CONTRACT_STATUSES, DEFAULT_SEND_METHODS, DEFAULT_OUTGOING_STATUSES, DEFAULT_PARTIES_A, DEFAULT_LABOR_CONTRACT_TYPES, DEFAULT_RECIPIENTS, LABOR_NUMBER_EXAMPLE, CONTRACT_NUMBER_EXAMPLE, REPLY_NUMBER_EXAMPLE } from './constants.ts';

export interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultTab?: 'contract' | 'labor' | 'incoming' | 'outgoing';
}

/** All state and handlers of the create dialog; the per-business forms render from it. */
export function useCreateForm({ isOpen, onClose, onCreated, defaultTab = 'contract' }: CreateModalProps) {
  const { language, t, tf } = useLanguage();

  // The server reserves numbers atomically; tell the user when theirs was taken in the meantime
  const notifyReassigned = (created: any) => {
    if (created?.number_reassigned) {
      notify.info(tf('numberReassigned', { requested: created.requested_number, number: created.document_number }));
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
  const [contractStorageLocation, setContractStorageLocation] = useState('');
  const [renewalTerms, setRenewalTerms] = useState('');

  // Incoming Document form fields
  const [incomingDocNumber, setIncomingDocNumber] = useState('');
  const [incomingOrigNumber, setIncomingOrigNumber] = useState('');
  const [incomingTitle, setIncomingTitle] = useState('');
  const [incomingCategory, setIncomingCategory] = useState('Công văn'); // i18n-data
  const [selectedIncomingIssuer, setSelectedIncomingIssuer] = useState(DEFAULT_AGENCIES[0]);
  const [isCustomIncomingIssuer, setIsCustomIncomingIssuer] = useState(false);
  const [incomingIssuer, setIncomingIssuer] = useState(DEFAULT_AGENCIES[0]);
  const [incomingDepartment, setIncomingDepartment] = useState('');
  const [selectedIncomingHandler, setSelectedIncomingHandler] = useState('');
  const [isCustomIncomingHandler, setIsCustomIncomingHandler] = useState(false);
  const [incomingHandler, setIncomingHandler] = useState('');
  const [incomingReceiveDate, setIncomingReceiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [incomingIssueDate, setIncomingIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [incomingDueDate, setIncomingDueDate] = useState('');
  const [incomingUrgency, setIncomingUrgency] = useState('Thường'); // i18n-data
  const [incomingSecurity, setIncomingSecurity] = useState('Thường'); // i18n-data
  const [incomingDirective, setIncomingDirective] = useState('');
  const [incomingStorageType, setIncomingStorageType] = useState('Gốc'); // i18n-data
  const [incomingStorageLocation, setIncomingStorageLocation] = useState('');

  // Outgoing Document form fields
  const [outgoingDocNumber, setOutgoingDocNumber] = useState('');
  const [outgoingTitle, setOutgoingTitle] = useState('');
  const [outgoingCategory, setOutgoingCategory] = useState('Công văn'); // i18n-data
  const [outgoingCategoryCode, setOutgoingCategoryCode] = useState('CV');
  const [outgoingDepartment, setOutgoingDepartment] = useState('');
  const [outgoingDeptCode, setOutgoingDeptCode] = useState('HCNS');
  const [selectedOutgoingHandler, setSelectedOutgoingHandler] = useState('');
  const [isCustomOutgoingHandler, setIsCustomOutgoingHandler] = useState(false);
  const [outgoingHandler, setOutgoingHandler] = useState('');
  const [selectedOutgoingSigner, setSelectedOutgoingSigner] = useState('');
  const [isCustomOutgoingSigner, setIsCustomOutgoingSigner] = useState(false);
  const [outgoingSigner, setOutgoingSigner] = useState('');
  const [selectedOutgoingRecipient, setSelectedOutgoingRecipient] = useState('');
  const [isCustomOutgoingRecipient, setIsCustomOutgoingRecipient] = useState(false);
  const [outgoingRecipient, setOutgoingRecipient] = useState('');
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
  const [outgoingStorageLocation, setOutgoingStorageLocation] = useState('');

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
      setContractStorageLocation('');
    } else if (defaultTab === 'contract') {
      setContractType('service');
      setContractCategory(DEFAULT_CONTRACT_TYPES[0]);
      setContractStorageLocation('');
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
      notify.error(t.requiredFieldsAlert);
      return;
    }

    setIsSubmitting(true);
    try {
      const fullStorage = contractStorageLocation.trim() ? `${contractStorageType} (${contractStorageLocation.trim()})` : contractStorageType;
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
      notify.success(t.recordSavedSuccess);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 400);
    } catch (err: any) {
      const msg = err.message || String(err);
      setUploadError(msg);
      notify.error(tf('createContractFailed', { error: msg }));
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
      notify.error(t.requiredFieldsAlert);
      return;
    }

    setIsSubmitting(true);
    setUploadError('');
    try {
      const fullStorage = incomingStorageLocation.trim() ? `${incomingStorageType} (${incomingStorageLocation.trim()})` : incomingStorageType;
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
      notify.success(t.recordSavedSuccess);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 400);
    } catch (err: any) {
      const msg = err.message || String(err);
      setUploadError(msg);
      notify.error(tf('receiveDocumentFailed', { error: msg }));
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
      notify.error(t.requiredFieldsAlert);
      return;
    }

    setIsSubmitting(true);
    setUploadError('');
    try {
      const fullStorage = outgoingStorageLocation.trim() ? `${outgoingStorageType} (${outgoingStorageLocation.trim()})` : outgoingStorageType;
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
      notify.success(t.recordSavedSuccess);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 400);
    } catch (err: any) {
      const msg = err.message || String(err);
      setUploadError(msg);
      notify.error(tf('issueDocumentFailed', { error: msg }));
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

  return {
    language,
    t,
    tf,
    notifyReassigned,
    user,
    canViewLabor,
    tab,
    setTab,
    isSubmitting,
    setIsSubmitting,
    categories,
    setCategories,
    partners,
    setPartners,
    currencyList,
    setCurrencyList,
    contractNumber,
    setContractNumber,
    contractTitle,
    setContractTitle,
    contractCategory,
    setContractCategory,
    contractType,
    setContractType,
    selectedPartyA,
    setSelectedPartyA,
    isCustomPartyA,
    setIsCustomPartyA,
    partyA,
    setPartyA,
    selectedPartnerId,
    setSelectedPartnerId,
    isCustomPartner,
    setIsCustomPartner,
    partyB,
    setPartyB,
    partnerCode,
    setPartnerCode,
    partnerTaxId,
    setPartnerTaxId,
    partnerContact,
    setPartnerContact,
    contractDepartment,
    setContractDepartment,
    contractValue,
    setContractValue,
    currency,
    setCurrency,
    signedDate,
    setSignedDate,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    contractStatus,
    setContractStatus,
    contractStorageType,
    setContractStorageType,
    contractStorageLocation,
    setContractStorageLocation,
    renewalTerms,
    setRenewalTerms,
    incomingDocNumber,
    setIncomingDocNumber,
    incomingOrigNumber,
    setIncomingOrigNumber,
    incomingTitle,
    setIncomingTitle,
    incomingCategory,
    setIncomingCategory,
    selectedIncomingIssuer,
    setSelectedIncomingIssuer,
    isCustomIncomingIssuer,
    setIsCustomIncomingIssuer,
    incomingIssuer,
    setIncomingIssuer,
    incomingDepartment,
    setIncomingDepartment,
    selectedIncomingHandler,
    setSelectedIncomingHandler,
    isCustomIncomingHandler,
    setIsCustomIncomingHandler,
    incomingHandler,
    setIncomingHandler,
    incomingReceiveDate,
    setIncomingReceiveDate,
    incomingIssueDate,
    setIncomingIssueDate,
    incomingDueDate,
    setIncomingDueDate,
    incomingUrgency,
    setIncomingUrgency,
    incomingSecurity,
    setIncomingSecurity,
    incomingDirective,
    setIncomingDirective,
    incomingStorageType,
    setIncomingStorageType,
    incomingStorageLocation,
    setIncomingStorageLocation,
    outgoingDocNumber,
    setOutgoingDocNumber,
    outgoingTitle,
    setOutgoingTitle,
    outgoingCategory,
    setOutgoingCategory,
    outgoingCategoryCode,
    setOutgoingCategoryCode,
    outgoingDepartment,
    setOutgoingDepartment,
    outgoingDeptCode,
    setOutgoingDeptCode,
    selectedOutgoingHandler,
    setSelectedOutgoingHandler,
    isCustomOutgoingHandler,
    setIsCustomOutgoingHandler,
    outgoingHandler,
    setOutgoingHandler,
    selectedOutgoingSigner,
    setSelectedOutgoingSigner,
    isCustomOutgoingSigner,
    setIsCustomOutgoingSigner,
    outgoingSigner,
    setOutgoingSigner,
    selectedOutgoingRecipient,
    setSelectedOutgoingRecipient,
    isCustomOutgoingRecipient,
    setIsCustomOutgoingRecipient,
    outgoingRecipient,
    setOutgoingRecipient,
    outgoingIssueDate,
    setOutgoingIssueDate,
    selectedLinkedDoc,
    setSelectedLinkedDoc,
    isCustomLinkedDoc,
    setIsCustomLinkedDoc,
    outgoingLinkedDoc,
    setOutgoingLinkedDoc,
    outgoingSendMethod,
    setOutgoingSendMethod,
    outgoingStatus,
    setOutgoingStatus,
    outgoingUrgency,
    setOutgoingUrgency,
    outgoingSecurity,
    setOutgoingSecurity,
    outgoingStorageType,
    setOutgoingStorageType,
    outgoingStorageLocation,
    setOutgoingStorageLocation,
    incomingDocsList,
    setIncomingDocsList,
    contractAttachMode,
    setContractAttachMode,
    contractCloudLink,
    setContractCloudLink,
    incomingAttachMode,
    setIncomingAttachMode,
    incomingCloudLink,
    setIncomingCloudLink,
    outgoingAttachMode,
    setOutgoingAttachMode,
    outgoingCloudLink,
    setOutgoingCloudLink,
    selectedFile,
    setSelectedFile,
    uploadProgress,
    setUploadProgress,
    isUploadingFile,
    setIsUploadingFile,
    uploadError,
    setUploadError,
    uploadSuccess,
    setUploadSuccess,
    handleFileChange,
    regenerateIncomingNumber,
    regenerateOutgoingNumber,
    handlePartyAChange,
    handlePartnerChange,
    handleContractCategoryChange,
    handleOutgoingCategoryChange,
    handleOutgoingDepartmentChange,
    handleIncomingIssuerChange,
    handleIncomingHandlerChange,
    handleOutgoingRecipientChange,
    handleOutgoingHandlerChange,
    handleOutgoingSignerChange,
    handleLinkedDocChange,
    handleContractSubmit,
    handleIncomingSubmit,
    handleOutgoingSubmit,
    docTypesList,
    contractTypesList,
    contractDeptsList,
    departmentsList,
    agenciesList,
    personnelList,
    urgencyLevelsList,
    securityLevelsList,
    storageTypesList,
    storageLocationsList,
    sendMethodsList,
    outgoingStatusesList,
    contractStatusesList,
    partiesAList,
    isOpen,
    onClose,
    onCreated,
  };
}

export type CreateFormState = ReturnType<typeof useCreateForm>;
