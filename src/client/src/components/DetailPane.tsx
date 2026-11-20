import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  CheckCircle,
  Trash2,
  AlertTriangle,
  Building,
  User,
  Calendar,
  FileCheck2,
  Clock,
  Tag,
  ShieldCheck,
  Pencil,
  UploadCloud,
  ExternalLink,
  X,
  Check,
  FolderOpen,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { UnifiedItem } from './ItemList.tsx';
import { DocumentViewer, GoogleDriveIcon } from './DocumentViewer.tsx';
import { AttachmentsPanel } from './AttachmentsPanel.tsx';
import { HistoryPanel } from './HistoryPanel.tsx';
import { api } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { documentDeadlineLabel, seedLabel, urgencyLabel } from '../i18n/index.ts';
import { formatCurrencyValue, getCurrencySymbol } from '../utils/currency.ts';

interface DetailPaneProps {
  item: UnifiedItem | null;
  onLiquidateContract: (id: string) => Promise<void>;
  onDeleteItem: (item: UnifiedItem) => Promise<void>;
  onEditItem?: (item: UnifiedItem) => void;
  onItemUpdated?: (item: UnifiedItem) => void;
  onRefresh?: () => void;
}

export const DetailPane: React.FC<DetailPaneProps> = ({
  item,
  onLiquidateContract,
  onDeleteItem,
  onEditItem,
  onItemUpdated,
  onRefresh,
}) => {
  const { language, t, tf } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [isSavingDrive, setIsSavingDrive] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [companyDriveFolder, setCompanyDriveFolder] = useState('https://drive.google.com/drive/my-drive');

  // Load company drive folder from settings
  useEffect(() => {
    api.getCategorySettings()
      .then(res => {
        if (res?.settings?.google_drive_folder_url) {
          setCompanyDriveFolder(res.settings.google_drive_folder_url);
        }
      })
      .catch(console.error);
  }, []);

  // Update drive input when item changes
  useEffect(() => {
    if (item?.data?.google_drive_url) {
      setDriveUrlInput(item.data.google_drive_url);
    } else {
      setDriveUrlInput('');
    }
  }, [item]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  if (!item) {
    return (
      <div className="detail-pane" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileCheck2 size={48} strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.5 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t.detailEmptyTitle}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {t.detailEmptyHint}
          </div>
        </div>
      </div>
    );
  }

  // Handle direct file upload with real-time progress and error handling
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError('');
    setUploadSuccess(false);
    setUploadProgress(0);

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(tf('uploadTooLargeUseDrive', { name: file.name, size: (file.size / (1024 * 1024)).toFixed(2) }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setIsUploading(true);
      const res = await api.uploadFile(file, (percent) => {
        setUploadProgress(percent);
      });

      if (item.kind === 'contract') {
        const updated = await api.updateContract(item.data.id, {
          file_key: res.file_key,
          file_name: res.file_name,
          file_size: res.file_size,
          file_type: res.file_type,
        });
        if (onItemUpdated) onItemUpdated({ kind: 'contract', data: updated });
      } else {
        const updated = await api.updateDocument(item.data.id, {
          file_key: res.file_key,
          file_name: res.file_name,
          file_size: res.file_size,
          file_type: res.file_type,
        });
        if (onItemUpdated) onItemUpdated({ kind: 'document', data: updated });
      }

      setUploadSuccess(true);
      if (onRefresh) onRefresh();
      showToast(tf('uploadFileSuccess', { name: res.file_name }));
      setTimeout(() => {
        setUploadSuccess(false);
        setUploadProgress(0);
      }, 3000);
    } catch (err: any) {
      setUploadError(err.message || t.uploadFileFailed);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Save Google Drive Link
  const handleSaveDriveLink = async (customUrl?: string) => {
    try {
      setIsSavingDrive(true);
      const urlToSave = customUrl !== undefined ? customUrl : driveUrlInput.trim();
      const res = await api.syncGoogleDrive(
        item.data.id,
        item.kind,
        urlToSave || companyDriveFolder
      );

      if (item.kind === 'contract') {
        if (onItemUpdated) onItemUpdated({ kind: 'contract', data: res.record });
      } else {
        if (onItemUpdated) onItemUpdated({ kind: 'document', data: res.record });
      }

      if (onRefresh) onRefresh();
      setIsDriveModalOpen(false);
      showToast(t.driveSyncSuccess);
    } catch (err: any) {
      alert(err.message || t.driveSaveFailed);
    } finally {
      setIsSavingDrive(false);
    }
  };

  // Handle Remove Google Drive Link
  const handleRemoveDriveLink = async () => {
    try {
      setIsSavingDrive(true);
      if (item.kind === 'contract') {
        const updated = await api.updateContract(item.data.id, {
          google_drive_url: null,
          google_drive_synced_at: null,
        });
        if (onItemUpdated) onItemUpdated({ kind: 'contract', data: updated });
      } else {
        const updated = await api.updateDocument(item.data.id, {
          google_drive_url: null,
          google_drive_synced_at: null,
        });
        if (onItemUpdated) onItemUpdated({ kind: 'document', data: updated });
      }

      if (onRefresh) onRefresh();
      setDriveUrlInput('');
      setIsDriveModalOpen(false);
      showToast(t.driveRemoveSuccess);
    } catch (err: any) {
      alert(err.message || t.driveRemoveFailed);
    } finally {
      setIsSavingDrive(false);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'VND') =>
    `${formatCurrencyValue(amount, currency)} ${getCurrencySymbol(currency)}`;

  const hasFile = Boolean(item.data.file_key && item.data.file_key.trim().length > 0 && item.data.file_key !== '#');
  const hasDriveLink = Boolean(item.data.google_drive_url && item.data.google_drive_url.trim().length > 0);

  const downloadFileUrl = hasFile
    ? item.data.file_key!.startsWith('http')
      ? item.data.file_key!
      : item.data.file_key!.startsWith('samples/')
      ? `/${item.data.file_key}`
      : `/api/files/${item.data.file_key}`
    : null;

  return (
    <div className="detail-pane" style={{ position: 'relative' }}>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Upload Progress Bar & Instant Error Notification */}
      {uploadError && (
        <div className="upload-progress-box has-error" style={{ margin: '12px 16px 0 16px' }}>
          <div className="upload-error-text">
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{uploadError}</span>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="upload-progress-box" style={{ margin: '12px 16px 0 16px' }}>
          <div className="upload-progress-header">
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {t.uploadingToServer}
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
        <div className="upload-progress-box is-success" style={{ margin: '12px 16px 0 16px' }}>
          <div className="upload-success-text">
            <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
            <span>{t.uploadAndSaveSuccess}</span>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="floating-toast">
          <Check size={16} color="var(--success-dot)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {item.kind === 'contract' ? (
        (() => {
          const c = item.data;
          const isUrgent = c.urgency?.level === 'urgent';
          const isExpired = c.urgency?.level === 'expired';
          const isLiquidated = c.status === 'liquidated';

          return (
            <>
              {/* Top Header */}
              <div className="detail-top-bar">
                <div className="detail-title-section">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="detail-category-tag">{t.detailContractTitle} / {c.contract_number}</span>
                    {hasDriveLink && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: 11,
                          fontWeight: 600,
                          border: '1px solid #bfdbfe',
                        }}
                      >
                        <GoogleDriveIcon size={12} />
                        <span>Google Drive</span>
                      </span>
                    )}
                  </div>
                  <h1 className="detail-title">{c.title}</h1>
                  <span className="detail-meta-line">
                    {t.partnerLabel}: <strong style={{ color: 'var(--text-primary)' }}>{c.party_b}</strong> · {t.signedOnDate} {c.signed_date}
                  </span>
                </div>

                <div className="detail-actions-row">
                  {isAdmin && onEditItem && (
                    <button
                      className="btn-secondary"
                      onClick={() => onEditItem(item)}
                      title={t.edit}
                    >
                      <Pencil size={14} />
                      <span>{t.edit}</span>
                    </button>
                  )}

                  {isAdmin && !isLiquidated && (
                    <button
                      className="btn-secondary"
                      onClick={() => onLiquidateContract(c.id)}
                      title={t.liquidateAction}
                    >
                      <CheckCircle size={14} color="var(--success-dot)" />
                      <span>{t.liquidateAction}</span>
                    </button>
                  )}

                  {/* Upload / Replace Attachment Button */}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      title={hasFile ? t.replaceAttachmentBtn : t.uploadAttachmentBtn}
                    >
                      {isUploading ? (
                        <span className="spinner" style={{ width: 14, height: 14 }} />
                      ) : (
                        <UploadCloud size={14} />
                      )}
                      <span>{isUploading ? t.uploadingAttachment : hasFile ? t.replaceAttachmentBtn : t.uploadAttachmentBtn}</span>
                    </button>
                  )}

                  {/* Google Drive Button */}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsDriveModalOpen(true)}
                      style={
                        hasDriveLink
                          ? { color: '#1d4ed8', borderColor: '#bfdbfe', background: '#eff6ff' }
                          : undefined
                      }
                      title="Google Drive"
                    >
                      <GoogleDriveIcon size={14} />
                      <span>{hasDriveLink ? 'Google Drive' : t.transferGoogleDriveBtn}</span>
                    </button>
                  )}

                  {/* Download Local File */}
                  {c.file_key && downloadFileUrl && (
                    <a
                      href={downloadFileUrl}
                      download={c.file_name || 'hop-dong.pdf'}
                      className="btn-primary"
                      style={{ textDecoration: 'none' }}
                    >
                      <Download size={14} />
                      <span>{t.downloadFileBtn}</span>
                    </a>
                  )}

                  {isAdmin && (
                    <button
                      className="btn-icon"
                      onClick={() => onDeleteItem(item)}
                      title={t.delete}
                      style={{ color: 'var(--urgent-dot)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Urgency Alert Strip */}
              {(isUrgent || isExpired) && !isLiquidated && (
                <div
                  style={{
                    padding: '12px 18px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--urgent-bg)',
                    border: '1px solid var(--urgent-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={18} color="var(--urgent-dot)" />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--urgent-text)' }}>
                        {isExpired ? t.contractExpiredAlert : t.contractExpiringAlert}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        {t.expiryDateLabel}: <strong>{c.end_date || t.notSpecified}</strong>
                        {c.urgency?.daysRemaining !== null && (
                          <span> ({tf('daysCount', { days: c.urgency?.daysRemaining ?? '' })})</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ height: 30, fontSize: 11, padding: '0 12px' }}
                    onClick={() => onLiquidateContract(c.id)}
                  >
                    {t.liquidateNow}
                  </button>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <span className="metric-label">{t.contractValueLabel}</span>
                  <span className="metric-value">{formatCurrency(c.value, c.currency)}</span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">{t.partyBLabel}</span>
                  <span className="metric-value" style={{ fontSize: 16 }}>{c.party_b}</span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">{t.contractDurationLabel}</span>
                  <span className="metric-value" style={{ fontSize: 15 }}>
                    {c.duration_text || (c.end_date ? `${c.start_date} → ${c.end_date}` : t.indefiniteTerm)}
                  </span>
                </div>
              </div>

              {/* Information Card */}
              <div className="detail-card">
                <div className="detail-section-title">{t.contractDetailSectionTitle}</div>
                <div className="info-grid">
                  <div className="info-cell">
                    <span className="info-cell-label">{t.contractNumber}</span>
                    <span className="info-cell-value">{c.contract_number}</span>
                  </div>

                  {c.original_contract_number && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.originalContractNumberLabel}</span>
                      <span className="info-cell-value">{c.original_contract_number}</span>
                    </div>
                  )}

                  <div className="info-cell">
                    <span className="info-cell-label">{t.partyALabel}</span>
                    <span className="info-cell-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Building size={14} color="var(--text-muted)" />
                      {c.party_a}
                    </span>
                  </div>

                  <div className="info-cell">
                    <span className="info-cell-label">{t.categoryAndDepartment}</span>
                    <span className="info-cell-value">{c.contract_category || t.defaultContractCategory} {c.department ? `· ${c.department}` : ''}</span>
                  </div>

                  <div className="info-cell">
                    <span className="info-cell-label">{t.signingDateLabel}</span>
                    <span className="info-cell-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} color="var(--text-muted)" />
                      {c.signed_date}
                    </span>
                  </div>

                  <div className="info-cell">
                    <span className="info-cell-label">{t.expiryDateLabel}</span>
                    <span className="info-cell-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={14} color="var(--text-muted)" />
                      {c.end_date || t.indefiniteTerm}
                    </span>
                  </div>

                  {c.partner_tax_id && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.partnerTaxIdLabel}</span>
                      <span className="info-cell-value">{c.partner_tax_id}</span>
                    </div>
                  )}

                  {c.partner_contact && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.contactAndPhoneLabel}</span>
                      <span className="info-cell-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={14} color="var(--text-muted)" />
                        {c.partner_contact}
                      </span>
                    </div>
                  )}

                  {c.google_drive_url && (
                    <div className="info-cell" style={{ gridColumn: 'span 2' }}>
                      <span className="info-cell-label">{t.cloudStorageLabel}</span>
                      <a
                        href={c.google_drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="info-cell-value"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1d4ed8', textDecoration: 'none' }}
                      >
                        <GoogleDriveIcon size={14} />
                        <span style={{ textDecoration: 'underline' }}>{c.google_drive_url}</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>

                {c.renewal_terms && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                    <span className="info-cell-label">{t.renewalTermsLabel}</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {c.renewal_terms}
                    </p>
                  </div>
                )}
              </div>

              {/* Embedded Document Viewer */}
              <DocumentViewer
                fileName={c.file_name}
                fileKey={c.file_key}
                fileType={c.file_type}
                fileSize={c.file_size}
                title={c.title}
                summary={c.renewal_terms}
                storageLocation={c.storage_location}
                documentNumber={c.contract_number}
                issuer={c.party_a}
                googleDriveUrl={c.google_drive_url}
                onTriggerUpload={() => fileInputRef.current?.click()}
                onOpenDriveSync={() => setIsDriveModalOpen(true)}
              />
              <AttachmentsPanel
                recordType="contract"
                recordId={c.id}
                canEdit={isAdmin || (Boolean(user?.can_access_labor_contracts) && c.contract_type === 'labor')}
                onRecordChanged={(rec) => rec && onItemUpdated?.({ kind: 'contract', data: rec })}
              />
              <HistoryPanel recordType="contract" recordId={c.id} refreshKey={`${c.revision}:${c.updated_at}`} />
            </>
          );
        })()
      ) : (
        (() => {
          const d = item.data;
          const typeLabels: Record<string, string> = {
            incoming: t.incomingDoc,
            outgoing: t.outgoingDoc,
            decision: t.decisions,
            internal: t.docTypeInternal,
            other: t.docTypeOther,
          };

          return (
            <>
              {/* Top Header */}
              <div className="detail-top-bar">
                <div className="detail-title-section">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="detail-category-tag">
                      {t.documentBreadcrumb} / {typeLabels[d.doc_type] || d.doc_type} / {d.document_number}
                    </span>
                    {hasDriveLink && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: 11,
                          fontWeight: 600,
                          border: '1px solid #bfdbfe',
                        }}
                      >
                        <GoogleDriveIcon size={12} />
                        <span>Google Drive</span>
                      </span>
                    )}
                  </div>
                  <h1 className="detail-title">{d.title}</h1>
                  <span className="detail-meta-line">
                    {t.issuingAuthorityLabel}: <strong style={{ color: 'var(--text-primary)' }}>{d.issuer || t.issuedInternally}</strong> · {t.signedDateLabel}: {d.issue_date}
                  </span>
                </div>

                <div className="detail-actions-row">
                  {isAdmin && onEditItem && (
                    <button
                      className="btn-secondary"
                      onClick={() => onEditItem(item)}
                      title={t.editDocumentTooltip}
                    >
                      <Pencil size={14} />
                      <span>{t.edit}</span>
                    </button>
                  )}

                  {/* Upload / Replace Attachment Button */}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      title={hasFile ? t.uploadReplacementTooltip : t.uploadAttachmentTooltip}
                    >
                      {isUploading ? (
                        <span className="spinner" style={{ width: 14, height: 14 }} />
                      ) : (
                        <UploadCloud size={14} />
                      )}
                      <span>{isUploading ? t.uploadingAttachment : hasFile ? t.replaceFile : t.uploadFile}</span>
                    </button>
                  )}

                  {/* Google Drive Button */}
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsDriveModalOpen(true)}
                      style={
                        hasDriveLink
                          ? { color: '#1d4ed8', borderColor: '#bfdbfe', background: '#eff6ff' }
                          : undefined
                      }
                      title={t.driveButtonTooltip}
                    >
                      <GoogleDriveIcon size={14} />
                      <span>{hasDriveLink ? 'Google Drive' : t.moveToDrive}</span>
                    </button>
                  )}

                  {/* Download Local File */}
                  {d.file_key && downloadFileUrl && (
                    <a
                      href={downloadFileUrl}
                      download={d.file_name || 'van-ban.pdf'}
                      className="btn-primary"
                      style={{ textDecoration: 'none' }}
                    >
                      <Download size={14} />
                      <span>{t.downloadFile}</span>
                    </a>
                  )}

                  {isAdmin && (
                    <button
                      className="btn-icon"
                      onClick={() => onDeleteItem(item)}
                      title={t.deleteDocumentTooltip}
                      style={{ color: 'var(--urgent-dot)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {/* Document Deadline Alert Strip */}
              {d.deadline_status && (
                <div
                  style={{
                    padding: '12px 18px',
                    borderRadius: 'var(--radius-md)',
                    background:
                      d.deadline_status.level === 'overdue'
                        ? 'var(--urgent-bg)'
                        : d.deadline_status.level === 'urgent'
                        ? 'rgba(244, 63, 94, 0.1)'
                        : 'var(--bg-secondary)',
                    border: `1px solid ${
                      d.deadline_status.level === 'overdue'
                        ? 'var(--urgent-border)'
                        : d.deadline_status.level === 'urgent'
                        ? '#FDA4AF'
                        : 'var(--border-color)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle
                      size={18}
                      color={d.deadline_status.level === 'overdue' ? 'var(--urgent-dot)' : d.deadline_status.color}
                    />
                    <div>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: d.deadline_status.level === 'overdue' ? 'var(--urgent-text)' : 'var(--text-primary)',
                        }}
                      >
                        {t.processingStatusLabel}: {documentDeadlineLabel(t, d.deadline_status)}
                      </span>
                      {d.due_date && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                          · {t.dueDateLabel}: <strong>{d.due_date}</strong>
                        </span>
                      )}
                      {d.completed_date && (
                        <span style={{ fontSize: 12, color: 'var(--success-text)', marginLeft: 8 }}>
                          · {t.completedOnLabel}: {d.completed_date}
                        </span>
                      )}
                    </div>
                  </div>
                  {d.department && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t.responsibleUnitLabel}: {d.department}
                    </span>
                  )}
                </div>
              )}

              {/* Executive Directive Callout */}
              {d.directive && (
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(217, 119, 6, 0.08)',
                    border: '1px solid rgba(217, 119, 6, 0.3)',
                    borderLeft: '4px solid #D97706',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    {t.boardDirectiveTitle}
                  </div>
                  <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600, lineHeight: 1.5 }}>
                    "{d.directive}"
                  </div>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <span className="metric-label">{t.categoryAndUrgency}</span>
                  <span className="metric-value" style={{ fontSize: 15 }}>
                    {seedLabel(language, d.doc_category) || typeLabels[d.doc_type] || d.doc_type}
                    {d.urgency_level && d.urgency_level !== 'Thường' && (
                      <span style={{ fontSize: 12, color: '#F43F5E', marginLeft: 6, fontWeight: 700 }}>
                        ({urgencyLabel(t, d.urgency_level)})
                      </span>
                    )}
                  </span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">{t.senderOrRecipient}</span>
                  <span className="metric-value" style={{ fontSize: 15, wordBreak: 'break-word' }}>
                    {d.issuer || d.recipient || t.internalCompany}
                  </span>
                </div>

                <div className="metric-card">
                  <span className="metric-label">{t.handlerAndUnit}</span>
                  <span className="metric-value" style={{ fontSize: 14 }}>
                    {d.handler ? `${d.handler}` : t.unassigned}
                    {d.department && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontWeight: 400 }}>
                        {d.department}
                      </div>
                    )}
                  </span>
                </div>
              </div>

              {/* Information Card */}
              <div className="detail-card">
                <div className="detail-section-title">{t.documentSummarySection}</div>
                <div className="info-grid">
                  <div className="info-cell">
                    <span className="info-cell-label">{t.registrationNumber}</span>
                    <span className="info-cell-value">{d.document_number}</span>
                  </div>

                  {d.original_doc_number && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.originalNumberLabel}</span>
                      <span className="info-cell-value" style={{ color: '#2563EB', fontWeight: 700 }}>
                        {d.original_doc_number}
                      </span>
                    </div>
                  )}

                  <div className="info-cell">
                    <span className="info-cell-label">{t.issueDateLabel}</span>
                    <span className="info-cell-value">{d.issue_date}</span>
                  </div>

                  {d.received_date && (
                    <div className="info-cell">
                      <span className="info-cell-label">{d.doc_type === 'outgoing' ? t.sentDateLabel : t.receivedDateLabel}</span>
                      <span className="info-cell-value">{d.received_date}</span>
                    </div>
                  )}

                  {d.signer && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.docSignerCol}</span>
                      <span className="info-cell-value">{d.signer}</span>
                    </div>
                  )}

                  {d.send_method && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.deliveryMethodLabel}</span>
                      <span className="info-cell-value">{d.send_method}</span>
                    </div>
                  )}

                  {d.linked_doc_number && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.linkedDocumentLabel}</span>
                      <span className="info-cell-value" style={{ color: '#6366F1', fontWeight: 600 }}>
                        {d.linked_doc_number}
                      </span>
                    </div>
                  )}

                  {d.storage_location && (
                    <div className="info-cell">
                      <span className="info-cell-label">{t.originalStorageLabel}</span>
                      <span className="info-cell-value">{d.storage_location}</span>
                    </div>
                  )}

                  {d.tags && (
                    <div className="info-cell" style={{ gridColumn: 'span 2' }}>
                      <span className="info-cell-label">{t.keywordsLabel}</span>
                      <span className="info-cell-value" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Tag size={12} color="var(--text-muted)" />
                        {d.tags}
                      </span>
                    </div>
                  )}

                  {d.google_drive_url && (
                    <div className="info-cell" style={{ gridColumn: 'span 2' }}>
                      <span className="info-cell-label">{t.cloudStorageLabel}</span>
                      <a
                        href={d.google_drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="info-cell-value"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#1d4ed8', textDecoration: 'none' }}
                      >
                        <GoogleDriveIcon size={14} />
                        <span style={{ textDecoration: 'underline' }}>{d.google_drive_url}</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>

                {d.summary && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                    <span className="info-cell-label">{t.documentSummaryLabel}</span>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                      {d.summary}
                    </p>
                  </div>
                )}
              </div>

              {/* Embedded Viewer */}
              <DocumentViewer
                fileName={d.file_name}
                fileKey={d.file_key}
                fileType={d.file_type}
                fileSize={d.file_size}
                title={d.title}
                summary={d.summary}
                storageLocation={d.storage_location}
                documentNumber={d.document_number}
                issuer={d.issuer}
                googleDriveUrl={d.google_drive_url}
                onTriggerUpload={() => fileInputRef.current?.click()}
                onOpenDriveSync={() => setIsDriveModalOpen(true)}
              />
              <AttachmentsPanel
                recordType="document"
                recordId={d.id}
                canEdit={isAdmin}
                onRecordChanged={(rec) => rec && onItemUpdated?.({ kind: 'document', data: rec })}
              />
              <HistoryPanel recordType="document" recordId={d.id} refreshKey={`${d.revision}:${d.updated_at}`} />
            </>
          );
        })()
      )}

      {/* Google Drive Transfer Modal */}
      {isDriveModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsDriveModalOpen(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 580 }}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <GoogleDriveIcon size={20} />
                </div>
                <div>
                  <h3 className="modal-title" style={{ fontSize: 16, margin: 0 }}>
                    {t.driveModalTitle}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {t.driveModalSubtitle}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsDriveModalOpen(false)}
                title={t.close}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Document Summary Card */}
              <div
                style={{
                  background: 'var(--bg-page)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  {item.kind === 'contract' ? t.contractWord : t.documentWord}: {item.data.title}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {t.referenceNumberLabel}: {item.kind === 'contract' ? (item.data as any).contract_number : (item.data as any).document_number}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {t.attachmentLabel}: <strong>{item.data.file_name || t.noLocalFile}</strong>
                    {item.data.file_size ? ` (${(item.data.file_size / 1024).toFixed(1)} KB)` : ''}
                  </div>

                  {downloadFileUrl && (
                    <a
                      href={downloadFileUrl}
                      download={item.data.file_name || 'document'}
                      className="btn btn-secondary"
                      style={{ height: 28, padding: '0 10px', fontSize: 11, textDecoration: 'none' }}
                    >
                      <Download size={12} />
                      <span>{t.downloadForDrive}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Step 1: Open Google Drive Folder */}
              <div
                style={{
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                    {t.driveStep1}
                  </span>
                  <a
                    href={companyDriveFolder}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ height: 30, padding: '0 12px', fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <FolderOpen size={13} />
                    <span>{t.openGoogleDrive}</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {t.driveStep1Hint} <code style={{ fontSize: 11 }}>{companyDriveFolder}</code>
                </div>
              </div>

              {/* Step 2: Paste Google Drive Share Link */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LinkIcon size={14} color="#2563EB" />
                  <span>{t.driveStep2}</span>
                </label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                  value={driveUrlInput}
                  onChange={e => setDriveUrlInput(e.target.value)}
                  autoFocus
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {t.driveStep2Hint}
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                  onClick={() => setDriveUrlInput(companyDriveFolder)}
                >
                  {t.useCompanyFolderLink}
                </button>

                {item.data.google_drive_url && (
                  <a
                    href={item.data.google_drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                    style={{ height: 28, fontSize: 11, padding: '0 10px', textDecoration: 'none', color: '#2563EB' }}
                  >
                    <ExternalLink size={12} style={{ marginRight: 4 }} />
                    {t.openCurrentLink}
                  </a>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              {item.data.google_drive_url && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleRemoveDriveLink}
                  disabled={isSavingDrive}
                  style={{ color: 'var(--urgent-dot)', marginRight: 'auto' }}
                >
                  {t.removeDriveLink}
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsDriveModalOpen(false)}
                disabled={isSavingDrive}
              >
                {t.cancel}
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSaveDriveLink()}
                disabled={isSavingDrive}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {isSavingDrive ? (
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                ) : (
                  <Check size={15} />
                )}
                <span>{t.saveAndSync}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
