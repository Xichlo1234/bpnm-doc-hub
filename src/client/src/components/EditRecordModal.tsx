import { PaperLocationFields } from './PaperLocationFields.tsx';
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Edit3, FileText, CheckCircle2, UploadCloud, ExternalLink, Paperclip, AlertCircle } from 'lucide-react';
import { api } from '../services/api.ts';
import type { UnifiedItem } from './ItemList.tsx';
import type { ContractRecord, DocumentRecord } from '../../../server/types.ts';
import { GoogleDriveIcon } from './DocumentViewer.tsx';
import {
  getNormalizedDocTypes,
  getNormalizedDepartments,
  getUnifiedContractDepartments,
  getUnifiedContractTypes,
} from '../utils/categoryHelpers.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { seedLabel, statusLabel } from '../i18n/index.ts';

// i18n-data: values written to the record; only their display label is translated.
const DEFAULT_DOC_CATEGORY = { name: 'Công văn', code: 'CV' };
// i18n-data
const DOC_STATUS_OPTIONS = ['Chưa phân công', 'Đang xử lý', 'Hoàn thành', 'Đã gửi', 'Trình ký'];
// i18n-data
const DEFAULT_RECIPIENTS = ['Toàn công ty', 'Ban Giám đốc'];
// i18n-data: example of the document numbering format
const LINKED_DOC_EXAMPLE = 'ĐẾN-2026-0001';

interface EditRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  item: UnifiedItem | null;
}

export const EditRecordModal: React.FC<EditRecordModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  item,
}) => {
  const { language, t, tf } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [categories, setCategories] = useState<any>(null);
  // Optimistic concurrency: the revision this form is based on, and the newer record on a 409
  const [baseRevision, setBaseRevision] = useState(0);
  const [conflictRecord, setConflictRecord] = useState<any>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const contractFileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // Contract form fields
  const [contractData, setContractData] = useState<Partial<ContractRecord>>({});

  // Document form fields
  const [docData, setDocData] = useState<Partial<DocumentRecord>>({});

  const handleContractFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploadSuccess(false);
    setUploadProgress(0);

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(tf('uploadTooLargeUseLink', { name: file.name, size: (file.size / (1024 * 1024)).toFixed(2) }));
      if (contractFileInputRef.current) contractFileInputRef.current.value = '';
      return;
    }

    try {
      setIsUploading(true);
      const res = await api.uploadFile(file, (percent) => {
        setUploadProgress(percent);
      });
      setContractData(prev => ({
        ...prev,
        file_key: res.file_key,
        file_name: res.file_name,
        file_size: res.file_size,
        file_type: res.file_type,
      }));
      setUploadSuccess(true);
    } catch (err: any) {
      setUploadError(err.message || t.uploadFileFailed);
    } finally {
      setIsUploading(false);
      if (contractFileInputRef.current) contractFileInputRef.current.value = '';
    }
  };

  const handleDocFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploadSuccess(false);
    setUploadProgress(0);

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(tf('uploadTooLargeUseLink', { name: file.name, size: (file.size / (1024 * 1024)).toFixed(2) }));
      if (docFileInputRef.current) docFileInputRef.current.value = '';
      return;
    }

    try {
      setIsUploading(true);
      const res = await api.uploadFile(file, (percent) => {
        setUploadProgress(percent);
      });
      setDocData(prev => ({
        ...prev,
        file_key: res.file_key,
        file_name: res.file_name,
        file_size: res.file_size,
        file_type: res.file_type,
      }));
      setUploadSuccess(true);
    } catch (err: any) {
      setUploadError(err.message || t.uploadFileFailed);
    } finally {
      setIsUploading(false);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  };

  // i18n-data: fallback currency records until settings load
  const [currencyList, setCurrencyList] = useState<any[]>([
    { code: 'USD', name: 'Đô la Mỹ ($)' },
    { code: 'KHR', name: 'Riel Campuchia (៛)' },
    { code: 'VND', name: 'Việt Nam Đồng (₫)' },
    { code: 'EUR', name: 'Euro (€)' },
  ]);

  useEffect(() => {
    if (isOpen) {
      api.getCategories().then(setCategories).catch(console.error);
      api.getCurrencies().then(res => {
        if (res && res.length > 0) setCurrencyList(res);
      }).catch(console.error);
      setErrorMessage('');
      setConflictRecord(null);
      setBaseRevision(item?.data.revision ?? 0);
      if (item?.kind === 'contract') {
        setContractData({ ...item.data });
      } else if (item?.kind === 'document') {
        setDocData({ ...item.data });
      }
    }
  }, [isOpen, item]);

  // The error box sits at the top of a long form; bring it into view when it appears
  useEffect(() => {
    if (errorMessage) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [errorMessage]);

  const handleSaveError = (err: any, fallback: string) => {
    if (err?.code === 'REVISION_CONFLICT') setConflictRecord(err.current);
    setErrorMessage(err?.message || fallback);
  };

  // Replace the form with the version someone else saved (the user's unsaved edits are dropped)
  const loadLatestVersion = () => {
    if (!conflictRecord) return;
    if (item?.kind === 'contract') setContractData({ ...conflictRecord });
    else setDocData({ ...conflictRecord });
    setBaseRevision(conflictRecord.revision ?? 0);
    setConflictRecord(null);
    setErrorMessage('');
  };

  // Apply the fields this user changed (compared with what the form was opened with) on top of the
  // latest saved version; fields both people changed are listed so the user can check them.
  const mergeWithLatest = () => {
    if (!conflictRecord || !item) return;
    const original: Record<string, any> = item.data as any;
    const mine: Record<string, any> = item.kind === 'contract' ? contractData : docData;
    const merged: Record<string, any> = { ...conflictRecord };
    const overlapping: string[] = [];
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    for (const key of Object.keys(mine)) {
      if (['revision', 'updated_at', 'created_at', 'urgency', 'deadline_status', 'allowed_transitions'].includes(key)) continue;
      if (!same(mine[key], original[key])) {
        if (!same(conflictRecord[key], original[key]) && !same(conflictRecord[key], mine[key])) overlapping.push(key);
        merged[key] = mine[key];
      }
    }
    if (item.kind === 'contract') setContractData(merged as any);
    else setDocData(merged as any);
    setBaseRevision(conflictRecord.revision ?? 0);
    setConflictRecord(null);
    setErrorMessage(overlapping.length > 0 ? tf('conflictMerged', { fields: overlapping.join(', ') }) : t.conflictMergedClean);
  };

  // Keep the user's edits and accept overwriting the newer version on the next save
  const overwriteWithMine = () => {
    if (!conflictRecord) return;
    setBaseRevision(conflictRecord.revision ?? 0);
    setConflictRecord(null);
    setErrorMessage(t.overwriteChosen);
  };

  if (!isOpen || !item) return null;

  const handleContractSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractData.title || !contractData.contract_number) {
      setErrorMessage(t.contractRequiredFields);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.updateContract(item.data.id, {
        ...contractData,
        value: Number(contractData.value) || 0,
        exchange_rate: Number(contractData.exchange_rate) || 25400,
        expected_revision: baseRevision,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      handleSaveError(err, t.errUpdateContract);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docData.title || !docData.document_number) {
      setErrorMessage(t.documentRequiredFields);
      return;
    }

    setIsSubmitting(true);
    try {
      try {
        await api.updateDocument(item.data.id, { ...docData, expected_revision: baseRevision });
      } catch (err: any) {
        // Issued outgoing documents need a reason for the change (logged as an adjustment)
        if (err?.code !== 'ADJUSTMENT_REASON_REQUIRED') throw err;
        const reason = window.prompt(t.adjReasonPrompt);
        if (!reason) throw err;
        await api.updateDocument(item.data.id, { ...docData, expected_revision: baseRevision, adjustment_reason: reason } as any);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      handleSaveError(err, t.errUpdateDocument);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: item.kind === 'contract' ? 'rgba(16, 124, 65, 0.1)' : 'rgba(37, 99, 235, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: item.kind === 'contract' ? '#107C41' : '#2563EB',
              }}
            >
              <Edit3 size={18} />
            </div>
            <div>
              <h2 className="modal-title">
                {item.kind === 'contract'
                  ? tf('editContractTitle', { number: (item.data as ContractRecord).contract_number })
                  : tf('editDocumentTitle', { number: (item.data as DocumentRecord).document_number })}
              </h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {item.kind === 'contract'
                  ? t.editContractSubtitle
                  : t.editDocumentSubtitle}
              </span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div
            ref={errorRef}
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {errorMessage}
            {conflictRecord && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={loadLatestVersion}>
                  {t.conflictLoadLatest}
                </button>
                <button type="button" className="btn btn-primary" onClick={mergeWithLatest}>
                  {t.conflictMerge}
                </button>
                <button type="button" className="btn" onClick={overwriteWithMine}>
                  {t.conflictKeepMine}
                </button>
              </div>
            )}
          </div>
        )}

        {/* CONTRACT EDIT FORM */}
        {item.kind === 'contract' ? (
          <form onSubmit={handleContractSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  {t.dochubContractNumberLabel} <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input mono-code"
                  value={contractData.contract_number || ''}
                  onChange={e => setContractData({ ...contractData, contract_number: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.originalContractNumberPartnerLabel}</label>
                <input
                  type="text"
                  className="form-input mono-code"
                  value={contractData.original_contract_number || ''}
                  onChange={e => setContractData({ ...contractData, original_contract_number: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t.contractTitleVnLabel} <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input"
                value={contractData.title || ''}
                onChange={e => setContractData({ ...contractData, title: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t.contractTitleEnLabel}</label>
              <input
                type="text"
                className="form-input"
                value={contractData.title_en || ''}
                onChange={e => setContractData({ ...contractData, title_en: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.partyAEntityLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  value={contractData.party_a || ''}
                  onChange={e => setContractData({ ...contractData, party_a: e.target.value })}
                  list="edit-parties-a-list"
                  placeholder={t.partyAPlaceholder}
                />
                <datalist id="edit-parties-a-list">
                  {categories?.parties_a?.map((pa: string) => (
                    <option key={pa} value={pa} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">{t.partyBLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  value={contractData.party_b || ''}
                  onChange={e => setContractData({ ...contractData, party_b: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.contractCategoryLabel}</label>
                <select
                  className="form-select"
                  value={contractData.contract_category || ''}
                  onChange={e => setContractData({ ...contractData, contract_category: e.target.value })}
                >
                  <option value="">{t.selectContractCategory}</option>
                  {getUnifiedContractTypes(categories, [], [], contractData.contract_category).map((ct) => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t.partnerCodeLabel}</label>
                <input
                  type="text"
                  className="form-input mono-code"
                  value={contractData.partner_code || ''}
                  onChange={e => setContractData({ ...contractData, partner_code: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.responsibleDepartmentLabel}</label>
                <select
                  className="form-select"
                  value={contractData.department || ''}
                  onChange={e => setContractData({ ...contractData, department: e.target.value })}
                >
                  <option value="">{t.selectDepartment}</option>
                  {getUnifiedContractDepartments(categories, [], [], contractData.department).map((dept) => (
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
                  value={contractData.status || 'active'}
                  onChange={e => setContractData({ ...contractData, status: e.target.value as any })}
                >
                  <option value="active">{t.contractStatusActiveOption}</option>
                  <option value="liquidated">{t.contractStatusLiquidatedOption}</option>
                  <option value="expired">{t.contractStatusExpiredOption}</option>
                  <option value="pending">{t.contractStatusPendingOption}</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.contractValueLabel}</label>
                <input
                  type="number"
                  className="form-input"
                  value={contractData.value ?? 0}
                  onChange={e => setContractData({ ...contractData, value: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.currencyLabel}</label>
                <select
                  className="form-select"
                  value={contractData.currency || 'USD'}
                  onChange={e => setContractData({ ...contractData, currency: e.target.value })}
                >
                  {currencyList.map((c: any) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.name ? `(${c.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t.exchangeRateLabel}</label>
                <input
                  type="number"
                  className="form-input"
                  value={contractData.exchange_rate || 25400}
                  onChange={e => setContractData({ ...contractData, exchange_rate: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.signingDateLabel}</label>
                <input
                  type="date"
                  className="form-input"
                  value={contractData.signed_date || ''}
                  onChange={e => setContractData({ ...contractData, signed_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.startDateLabel}</label>
                <input
                  type="date"
                  className="form-input"
                  value={contractData.start_date || ''}
                  onChange={e => setContractData({ ...contractData, start_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.endEffectiveDateLabel}</label>
                <input
                  type="date"
                  className="form-input"
                  value={contractData.end_date || ''}
                  onChange={e => setContractData({ ...contractData, end_date: e.target.value || null })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1.5 }}>
                <label className="form-label">{t.renewalTermsFormLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t.renewalTermsPlaceholder}
                  value={contractData.renewal_terms || ''}
                  onChange={e => setContractData({ ...contractData, renewal_terms: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t.originalFileLocationLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  list="edit-storage-locations-list"
                  placeholder={t.originalFileLocationPlaceholder}
                  value={contractData.storage_location || ''}
                  onChange={e => setContractData({ ...contractData, storage_location: e.target.value })}
                />
                <datalist id="edit-storage-locations-list">
                  {categories?.storage_locations?.map((loc: string) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>
            </div>
            <PaperLocationFields
              value={contractData as any}
              onChange={(field, value) => setContractData({ ...contractData, [field]: value } as any)}
            />

            <div className="form-group">
              <label className="form-label">{t.additionalNotesLabel}</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={contractData.notes || ''}
                onChange={e => setContractData({ ...contractData, notes: e.target.value })}
              />
            </div>

            {/* Attachment & Google Drive */}
            <div style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Paperclip size={15} color="var(--accent-primary)" />
                <span>{t.attachmentsAndCloudSection}</span>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t.serverAttachmentLabel}</label>
                  <input
                    type="file"
                    ref={contractFileInputRef}
                    accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
                    style={{ display: 'none' }}
                    onChange={handleContractFileSelect}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => contractFileInputRef.current?.click()}
                      disabled={isUploading}
                      style={{ height: 36, fontSize: 12 }}
                    >
                      <UploadCloud size={14} />
                      <span>{isUploading ? t.uploadingAttachment : contractData.file_name ? t.replaceWithNewFile : t.uploadFileBtn}</span>
                    </button>
                    {contractData.file_name && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {contractData.file_name} {contractData.file_size ? `(${(contractData.file_size / 1024).toFixed(1)} KB)` : ''}
                      </span>
                    )}
                  </div>

                  {uploadError && (
                    <div className="upload-progress-box has-error" style={{ marginTop: 8 }}>
                      <div className="upload-error-text">
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                        <span>{uploadError}</span>
                      </div>
                    </div>
                  )}

                  {isUploading && (
                    <div className="upload-progress-box" style={{ marginTop: 8 }}>
                      <div className="upload-progress-header">
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {t.uploadingToServerShort}
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
                    <div className="upload-progress-box is-success" style={{ marginTop: 8 }}>
                      <div className="upload-success-text">
                        <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                        <span>{t.attachmentUploadSuccess}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GoogleDriveIcon size={14} />
                    <span>{t.cloudLinkLabel}</span>
                  </label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder={t.cloudLinkPlaceholder}
                    value={contractData.google_drive_url || ''}
                    onChange={e => setContractData({ ...contractData, google_drive_url: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
                {t.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                <Save size={16} />
                <span>{isSubmitting ? t.saving : t.saveContractChanges}</span>
              </button>
            </div>
          </form>
        ) : (
          /* DOCUMENT EDIT FORM */
          <form onSubmit={handleDocumentSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  {t.documentNumberFormLabel} <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input mono-code"
                  value={docData.document_number || ''}
                  onChange={e => setDocData({ ...docData, document_number: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.senderOriginalNumberLabel}</label>
                <input
                  type="text"
                  className="form-input mono-code"
                  value={docData.original_doc_number || ''}
                  onChange={e => setDocData({ ...docData, original_doc_number: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t.documentSummaryLabel} <span style={{ color: 'red' }}>*</span>
              </label>
              <textarea
                className="form-textarea"
                rows={2}
                value={docData.title || ''}
                onChange={e => setDocData({ ...docData, title: e.target.value })}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.docTypeLabel}</label>
                <select
                  className="form-select"
                  value={docData.doc_category || DEFAULT_DOC_CATEGORY.name}
                  onChange={e => setDocData({ ...docData, doc_category: e.target.value })}
                >
                  {getNormalizedDocTypes(categories, [DEFAULT_DOC_CATEGORY]).map((dt) => (
                    <option key={dt.code || dt.name} value={dt.name}>
                      {seedLabel(language, dt.name)} {dt.code ? `(${dt.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t.issuerSenderLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  value={docData.issuer || ''}
                  onChange={e => setDocData({ ...docData, issuer: e.target.value })}
                  list="edit-doc-agencies"
                />
                <datalist id="edit-doc-agencies">
                  {categories?.agencies?.map((a: string) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">{t.recipientUnitLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  value={docData.recipient || ''}
                  onChange={e => setDocData({ ...docData, recipient: e.target.value })}
                  list="edit-doc-recipients"
                />
                <datalist id="edit-doc-recipients">
                  {DEFAULT_RECIPIENTS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                  {getNormalizedDepartments(categories).map((d) => (
                    <option key={d.code || d.name} value={d.name} />
                  ))}
                  {categories?.agencies?.map((a: string) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.handlingDepartmentLabel}</label>
                <select
                  className="form-select"
                  value={docData.department || ''}
                  onChange={e => setDocData({ ...docData, department: e.target.value })}
                >
                  <option value="">{t.selectDepartment}</option>
                  {getNormalizedDepartments(categories).map((d) => (
                    <option key={d.code || d.name} value={d.name}>
                      {seedLabel(language, d.name)} {d.code ? `(${d.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t.mainHandlerLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  value={docData.handler || ''}
                  onChange={e => setDocData({ ...docData, handler: e.target.value })}
                  list="edit-doc-personnel"
                />
                <datalist id="edit-doc-personnel">
                  {categories?.personnel?.map((p: any) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.department})
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">{t.resolutionStatusLabel}</label>
                <select
                  className="form-select"
                  value={docData.status || DOC_STATUS_OPTIONS[1]}
                  onChange={e => setDocData({ ...docData, status: e.target.value })}
                >
                  {DOC_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(t, s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.issueSignDateLabel}</label>
                <input
                  type="date"
                  className="form-input"
                  value={docData.issue_date || ''}
                  onChange={e => setDocData({ ...docData, issue_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.receivedDateFormLabel}</label>
                <input
                  type="date"
                  className="form-input"
                  value={docData.received_date || ''}
                  onChange={e => setDocData({ ...docData, received_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.deadlineFormLabel}</label>
                <input
                  type="date"
                  className="form-input"
                  value={docData.due_date || ''}
                  onChange={e => setDocData({ ...docData, due_date: e.target.value || null })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.actualCompletionDateLabel}</label>
                <input
                  type="date"
                  className="form-input"
                  value={docData.completed_date || ''}
                  onChange={e => setDocData({ ...docData, completed_date: e.target.value || null })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ color: '#D97706', fontWeight: 600 }}>
                {t.leadershipDirectiveLabel}
              </label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder={t.directivePlaceholder}
                value={docData.directive || ''}
                onChange={e => setDocData({ ...docData, directive: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{t.originalFileLocationLabel}</label>
                <input
                  type="text"
                  className="form-input"
                  list="edit-doc-storage-locations-list"
                  value={docData.storage_location || ''}
                  onChange={e => setDocData({ ...docData, storage_location: e.target.value })}
                />
                <datalist id="edit-doc-storage-locations-list">
                  {categories?.storage_locations?.map((loc: string) => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">{t.linkedDocFormLabel}</label>
                <input
                  type="text"
                  className="form-input mono-code"
                  placeholder={tf('examplePlaceholder', { example: LINKED_DOC_EXAMPLE })}
                  value={docData.linked_doc_number || ''}
                  onChange={e => setDocData({ ...docData, linked_doc_number: e.target.value })}
                />
              </div>
            </div>
            <PaperLocationFields
              value={docData as any}
              onChange={(field, value) => setDocData({ ...docData, [field]: value } as any)}
            />

            {/* Attachment & Google Drive */}
            <div style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Paperclip size={15} color="var(--accent-primary)" />
                <span>{t.attachmentsAndCloudSection}</span>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t.serverAttachmentLabel}</label>
                  <input
                    type="file"
                    ref={docFileInputRef}
                    accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
                    style={{ display: 'none' }}
                    onChange={handleDocFileSelect}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => docFileInputRef.current?.click()}
                      disabled={isUploading}
                      style={{ height: 36, fontSize: 12 }}
                    >
                      <UploadCloud size={14} />
                      <span>{isUploading ? t.uploadingAttachment : docData.file_name ? t.replaceWithNewFile : t.uploadFileBtn}</span>
                    </button>
                    {docData.file_name && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {docData.file_name} {docData.file_size ? `(${(docData.file_size / 1024).toFixed(1)} KB)` : ''}
                      </span>
                    )}
                  </div>

                  {uploadError && (
                    <div className="upload-progress-box has-error" style={{ marginTop: 8 }}>
                      <div className="upload-error-text">
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                        <span>{uploadError}</span>
                      </div>
                    </div>
                  )}

                  {isUploading && (
                    <div className="upload-progress-box" style={{ marginTop: 8 }}>
                      <div className="upload-progress-header">
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {t.uploadingToServerShort}
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
                    <div className="upload-progress-box is-success" style={{ marginTop: 8 }}>
                      <div className="upload-success-text">
                        <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                        <span>{t.attachmentUploadSuccess}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GoogleDriveIcon size={14} />
                    <span>{t.cloudLinkLabel}</span>
                  </label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder={t.cloudLinkPlaceholder}
                    value={docData.google_drive_url || ''}
                    onChange={e => setDocData({ ...docData, google_drive_url: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
                {t.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                <Save size={16} />
                <span>{isSubmitting ? t.saving : t.saveDocumentChanges}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
