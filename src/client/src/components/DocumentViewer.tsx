import React from 'react';
import {
  Download,
  ExternalLink,
  Presentation,
  FileText,
  CheckCircle2,
  UploadCloud,
  FolderArchive,
  Image as ImageIcon,
  FileSpreadsheet,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.tsx';

export const GoogleDriveIcon: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 16, style }) => (
  <svg width={size} height={size} viewBox="0 0 87.3 78" style={style}>
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
);

interface DocumentViewerProps {
  fileName?: string | null;
  fileKey?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  title: string;
  summary?: string | null;
  storageLocation?: string | null;
  documentNumber?: string | null;
  issuer?: string | null;
  googleDriveUrl?: string | null;
  onTriggerUpload?: () => void;
  onOpenDriveSync?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  fileName,
  fileKey,
  fileType,
  fileSize,
  title,
  summary,
  storageLocation,
  documentNumber,
  issuer,
  googleDriveUrl,
  onTriggerUpload,
  onOpenDriveSync,
}) => {
  const { t, tf } = useLanguage();
  const hasRealFile = Boolean(fileKey && fileKey.trim().length > 0 && fileKey !== '#');
  const isExternalLink = Boolean(fileKey && (fileKey.startsWith('http://') || fileKey.startsWith('https://')));

  const isPptx =
    fileName?.toLowerCase().endsWith('.pptx') ||
    fileName?.toLowerCase().endsWith('.ppt') ||
    fileType?.includes('presentation') ||
    (fileKey?.toLowerCase().endsWith('.pptx') ?? false);

  const isPdf =
    fileName?.toLowerCase().endsWith('.pdf') ||
    fileType?.includes('pdf') ||
    (fileKey?.toLowerCase().endsWith('.pdf') ?? false);

  const isImage = Boolean(
    fileName?.match(/\.(png|jpe?g|webp|gif|svg)$/i) ||
    fileType?.startsWith('image/')
  );

  const isExcel = Boolean(
    fileName?.match(/\.(xlsx|xls|csv|ods)$/i) ||
    fileType?.includes('spreadsheet') ||
    fileType?.includes('excel')
  );

  const isWord = Boolean(
    fileName?.match(/\.(docx?|odt|rtf)$/i) ||
    fileType?.includes('wordprocessingml') ||
    fileType?.includes('msword') ||
    fileType?.includes('opendocument.text')
  );

  const downloadUrl = hasRealFile
    ? isExternalLink
      ? fileKey!
      : fileKey!.startsWith('samples/')
      ? `/${fileKey}`
      : `/api/files/${fileKey}`
    : null;

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="preview-card" style={{ marginTop: 24 }}>
      {/* Top Header of Preview Card */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface-subtle)',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 220 }}>
          {isPptx ? (
            <Presentation size={18} color="#d97706" />
          ) : isImage ? (
            <ImageIcon size={18} color="#2563EB" />
          ) : isExcel ? (
            <FileSpreadsheet size={18} color="#16A34A" />
          ) : isWord ? (
            <FileText size={18} color="#2B579A" />
          ) : isPdf ? (
            <FileText size={18} color="#DC2626" />
          ) : (
            <FileText size={18} color="#107C41" />
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            {fileName || (hasRealFile ? t.attachedDocument : t.scannedRecord)}
          </span>
          {hasRealFile && fileSize && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({formatFileSize(fileSize)})
            </span>
          )}
        </div>

        {/* Right side actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Google Drive Status & Link */}
          {googleDriveUrl && (
            <a
              href={googleDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{
                textDecoration: 'none',
                height: 30,
                padding: '0 10px',
                fontSize: 11,
                color: '#1d4ed8',
                borderColor: '#bfdbfe',
                background: '#eff6ff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              title={t.openOnDriveTooltip}
            >
              <GoogleDriveIcon size={14} />
              <span>{t.openOnDrive}</span>
              <ExternalLink size={11} />
            </a>
          )}

          {/* Sync or Connect to Google Drive button */}
          {onOpenDriveSync && (
            <button
              type="button"
              onClick={onOpenDriveSync}
              className="btn-secondary"
              style={{ height: 30, padding: '0 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={t.driveButtonTooltip}
            >
              <GoogleDriveIcon size={13} />
              <span>{googleDriveUrl ? t.changeDrive : t.moveToDrive}</span>
            </button>
          )}

          {/* Upload or replace file button */}
          {onTriggerUpload && (
            <button
              type="button"
              onClick={onTriggerUpload}
              className="btn-secondary"
              style={{ height: 30, padding: '0 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title={t.uploadAttachmentTooltip}
            >
              <UploadCloud size={13} />
              <span>{hasRealFile ? t.replaceFile : t.uploadFile}</span>
            </button>
          )}

          {/* Download file button if real file exists */}
          {hasRealFile && downloadUrl && (
            <>
              <a
                href={downloadUrl}
                download={fileName || 'document'}
                target={isExternalLink ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ textDecoration: 'none', height: 30, padding: '0 10px', fontSize: 11 }}
              >
                <Download size={13} />
                <span>{isExternalLink ? t.openFile : t.downloadFile}</span>
              </a>

              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-icon"
                style={{ width: 30, height: 30 }}
                title={t.openInNewTab}
              >
                <ExternalLink size={13} />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="preview-viewer-container" style={{ padding: 0 }}>
        {hasRealFile && !isExternalLink && isPdf ? (
          /* Real PDF file: load inside object / embed with iframe fallback and direct action bar */
          <div style={{ position: 'relative', width: '100%', minHeight: '520px', background: '#525659' }}>
            <object
              data={`${downloadUrl!}#toolbar=1&navpanes=0`}
              type="application/pdf"
              style={{ width: '100%', height: '560px', display: 'block', border: 'none' }}
            >
              <iframe
                src={`${downloadUrl!}#toolbar=1`}
                title={title}
                style={{ width: '100%', height: '560px', border: 'none' }}
              >
                <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                  <p style={{ marginBottom: 12 }}>{t.pdfPreviewUnsupported}</p>
                  <a
                    href={downloadUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ExternalLink size={14} /> {t.openPdfInNewTab}
                  </a>
                </div>
              </iframe>
            </object>
          </div>
        ) : hasRealFile && !isExternalLink && isImage ? (
          /* Image preview (PNG, JPG, WEBP, SVG) */
          <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-surface)' }}>
            <img
              src={downloadUrl!}
              alt={title}
              style={{
                maxWidth: '100%',
                maxHeight: '480px',
                objectFit: 'contain',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                margin: '0 auto',
                display: 'block',
              }}
            />
          </div>
        ) : hasRealFile && isPptx ? (
          /* Real PPTX file: show rich presentation card */
          <div style={{ width: '100%', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: '#fff3e6',
                    color: '#d97706',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                  }}
                >
                  SLIDE POWERPOINT (THADS)
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.trainingMaterial}</span>
              </div>

              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {title}
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {summary || t.trainingMaterialDefaultSummary}
              </div>

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: '1px dashed var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CheckCircle2 size={13} color="var(--success-dot)" /> {t.officialCopy}
                  </span>
                  <span>{t.pptxFormat}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {onOpenDriveSync && (
                    <button
                      type="button"
                      onClick={onOpenDriveSync}
                      className="btn-secondary"
                      style={{ height: 34, padding: '0 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <GoogleDriveIcon size={14} />
                      <span>{t.moveToDrive}</span>
                    </button>
                  )}

                  <a
                    href={downloadUrl!}
                    download={fileName || 'slides.pptx'}
                    className="btn-primary"
                    style={{ textDecoration: 'none', height: 34, padding: '0 16px', fontSize: 12 }}
                  >
                    <Download size={14} />
                    <span>{t.downloadPptx}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : hasRealFile && isExternalLink ? (
          /* External storage link (Google Drive, SharePoint, etc.) */
          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <FolderArchive size={40} color="var(--accent-primary)" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              {t.cloudStoredTitle}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, maxWidth: 480, margin: '0 auto 18px' }}>
              {t.cloudStoredDesc} <code style={{ wordBreak: 'break-all' }}>{fileKey}</code>
            </div>
            <a
              href={downloadUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ display: 'inline-flex', textDecoration: 'none', height: 36, padding: '0 18px' }}
            >
              <ExternalLink size={14} />
              <span>{t.openOnlineDocument}</span>
            </a>
          </div>
        ) : hasRealFile ? (
          /* Generic Attached File Card (Word, Excel, ZIP, etc.) */
          <div style={{ padding: '28px 24px', textAlign: 'center', background: 'var(--bg-surface)' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: isExcel
                  ? 'rgba(22, 163, 74, 0.08)'
                  : isWord
                  ? 'rgba(43, 87, 154, 0.08)'
                  : 'rgba(37, 99, 235, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              {isExcel ? (
                <FileSpreadsheet size={28} color="#16A34A" />
              ) : isWord ? (
                <FileText size={28} color="#2B579A" />
              ) : (
                <FileText size={28} color="#2563EB" />
              )}
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {fileName || t.attachedDocument}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              {tf('fileFormatInfo', { type: fileType || t.binaryFile })} {fileSize ? tf('fileSizeInfo', { size: formatFileSize(fileSize) }) : ''}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <a
                href={downloadUrl!}
                download={fileName || 'tai-lieu'}
                className="btn-primary"
                style={{ textDecoration: 'none', height: 36, padding: '0 16px', fontSize: 12 }}
              >
                <Download size={14} />
                <span>{tf('downloadToDevice', { size: formatFileSize(fileSize) })}</span>
              </a>

              {onOpenDriveSync && (
                <button
                  type="button"
                  onClick={onOpenDriveSync}
                  className="btn-secondary"
                  style={{ height: 36, padding: '0 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <GoogleDriveIcon size={14} />
                  <span>{t.moveToDrive}</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* No electronic scan attached yet: render clean, official document dispatch sheet with Quick Action Upload */
          <div style={{ padding: '28px 24px', background: 'var(--bg-surface)' }}>
            <div
              style={{
                border: '1px dashed var(--border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '24px 20px',
                background: 'var(--bg-page)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(16, 124, 65, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}
              >
                <FileText size={24} color="var(--accent-primary)" />
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                {t.registryRecordTitle}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 440, margin: '0 auto 16px', lineHeight: 1.5 }}>
                {t.registryRecordDesc}
              </div>

              {/* Document metadata summary badge */}
              <div
                style={{
                  display: 'inline-grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 10,
                  maxWidth: 520,
                  width: '100%',
                  textAlign: 'left',
                  background: 'var(--bg-surface)',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: 16,
                  fontSize: 12,
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>{t.registrationNumber}</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{documentNumber || t.beingUpdated}</strong>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>{t.originalCopyLocationLabel}</span>
                  <strong style={{ color: 'var(--accent-primary)' }}>
                    {storageLocation || t.defaultStorageCabinet}
                  </strong>
                </div>

                {fileName && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: 11 }}>{t.standardFileName}</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>{fileName}</span>
                  </div>
                )}
              </div>

              {/* Action buttons inside placeholder */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                {onTriggerUpload && (
                  <button
                    type="button"
                    onClick={onTriggerUpload}
                    className="btn btn-primary"
                    style={{ height: 34, padding: '0 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <UploadCloud size={14} />
                    <span>{t.uploadAttachmentNow}</span>
                  </button>
                )}

                {onOpenDriveSync && (
                  <button
                    type="button"
                    onClick={onOpenDriveSync}
                    className="btn btn-secondary"
                    style={{ height: 34, padding: '0 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <GoogleDriveIcon size={14} />
                    <span>{t.driveModalTitle}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
