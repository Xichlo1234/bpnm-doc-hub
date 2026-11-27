import React, { useState } from 'react';
import { notify } from '../context/ToastContext.tsx';
import { X, UploadCloud, AlertCircle, CheckCircle2, FileSpreadsheet, Download, RefreshCw } from 'lucide-react';
import { readExcelFile, downloadExcelTemplate, parseDocumentExcelRow } from '../utils/excelHelper.ts';
import { DOCUMENT_TYPES } from '../../../server/types.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { api, type ImportPreview, type ImportCommitOptions } from '../services/api.ts';

export interface ExcelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'contract' | 'document';
  onImportConfirm: (parsedData: any[], options?: ImportCommitOptions) => Promise<{ added: number; updated: number; total: number }>;
  onSuccess: () => void;
}

export const ExcelManagerModal: React.FC<ExcelManagerModalProps> = ({
  isOpen,
  onClose,
  type,
  onImportConfirm,
  onSuccess,
}) => {
  const { t, tf } = useLanguage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [stats, setStats] = useState<{ total: number; newCount: number; updateCount: number; errorCount: number }>({
    total: 0,
    newCount: 0,
    updateCount: 0,
    errorCount: 0,
  });
  const [validationErrors, setValidationErrors] = useState<Array<{ row: number; error: string }>>([]);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  // Server-side dry run: the authoritative list of new / updated / unchanged / duplicate / invalid rows
  const [serverPreview, setServerPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptUpdates, setAcceptUpdates] = useState(false);

  if (!isOpen) return null;

  // i18n-data: template columns and sample rows are the import file format, not UI text.
  const handleDownloadTemplate = () => {
    if (type === 'contract') {
      downloadExcelTemplate(
        [
          { header: 'ID (Không sửa nếu cập nhật)', sample: '', width: 20 },
          { header: 'Số hợp đồng (*)', sample: 'HĐ-2026-001', width: 18 },
          { header: 'Tên / Nội dung hợp đồng (*)', sample: 'Hợp đồng mua sắm vật tư thiết bị mỏ', width: 35 },
          { header: 'Tên tiếng Anh', sample: 'Mining Equipment Procurement Contract', width: 30 },
          { header: 'Bên A (*)', sample: 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII', width: 35 },
          { header: 'Đối tác Bên B (*)', sample: 'Công ty Cổ phần Cơ khí Chế tạo Máy', width: 35 },
          { header: 'Phòng ban', sample: 'ENG - Ky thuat', width: 18 },
          { header: 'Giá trị hợp đồng', sample: '50000000', width: 18 },
          { header: 'Loại tiền', sample: 'USD', width: 12 },
          { header: 'Ngày ký (YYYY-MM-DD)', sample: '2026-01-15', width: 18 },
          { header: 'Ngày bắt đầu (YYYY-MM-DD)', sample: '2026-01-15', width: 18 },
          { header: 'Ngày hết hạn (YYYY-MM-DD)', sample: '2026-12-31', width: 18 },
          { header: 'Trạng thái', sample: 'active', width: 14 },
          { header: 'Ghi chú', sample: 'Bản scan đã lưu trữ', width: 25 },
        ],
        'Mau_Nhap_Du_Lieu_Hop_Dong_SGII.xlsx'
      );
    } else {
      downloadExcelTemplate(
        [
          { header: 'ID (Không sửa nếu cập nhật)', sample: '', width: 20 },
          { header: 'Số văn bản (*)', sample: 'CV-2026-001', width: 18 },
          { header: 'Trích yếu / Tiêu đề (*)', sample: 'V/v phê duyệt báo cáo đánh giá tác động môi trường', width: 40 },
          { header: `Loại văn bản (${DOCUMENT_TYPES.join(', ')})`, sample: 'incoming', width: 28 },
          { header: 'Cơ quan ban hành / Gửi đến', sample: 'Sở Tài nguyên và Môi trường', width: 30 },
          { header: 'Nơi nhận', sample: '', width: 24 },
          { header: 'Người ký', sample: 'Nguyễn Văn Giám Đốc', width: 20 },
          { header: 'Phòng ban phụ trách', sample: 'HCNS', width: 18 },
          { header: 'Người xử lý', sample: 'Trần Thị Chuyên Viên', width: 20 },
          { header: 'Ngày ban hành (YYYY-MM-DD)', sample: '2026-02-10', width: 20 },
          { header: 'Hạn xử lý (YYYY-MM-DD)', sample: '2026-02-25', width: 18 },
          { header: 'Độ khẩn', sample: 'Thường', width: 14 },
          { header: 'Trạng thái', sample: 'Đang xử lý', width: 16 },
          { header: 'Ý kiến chỉ đạo', sample: 'Khẩn trương phối hợp giải quyết đúng hạn', width: 35 },
          { header: 'Nơi lưu trữ', sample: 'Tủ 01 Kệ 2', width: 20 },
        ],
        'Mau_Nhap_Du_Lieu_Cong_Van_SGII.xlsx'
      );
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsLoading(true);
    setValidationErrors([]);
    setResultMsg(null);

    try {
      const rawRows = await readExcelFile(file);
      if (!rawRows || rawRows.length === 0) {
        setValidationErrors([{ row: 0, error: t.excelEmptyFile }]);
        setPreviewRows([]);
        return;
      }

      const parsed: any[] = [];
      const errors: Array<{ row: number; error: string }> = [];
      let newCount = 0;
      let updateCount = 0;

      rawRows.forEach((r, idx) => {
        const rowNum = idx + 2; // Excel 1-based, row 1 is header
        if (type === 'document') {
          const document = parseDocumentExcelRow(r);
          if (!document.document_number && !document.id) {
            errors.push({ row: rowNum, error: t.excelMissingDocumentNumber });
            return;
          }
          if (document.id) updateCount++;
          else newCount++;
          parsed.push(document);
          return;
        }
        const keys = Object.keys(r);

        const consumed = new Set<string>();
        const supplied = new Set<string>();
        const findVal = (field: string, patterns: string[]) => {
          const full = [field, ...patterns];
          const key = keys.find(key => full.includes(key.trim().toLowerCase())) ?? keys.find(key => {
            const clean = key.trim().toLowerCase();
            return patterns.some(pattern => pattern === 'id' ? clean.startsWith('id (') : clean.includes(pattern));
          });
          if (key === undefined) return '';
          consumed.add(key);
          supplied.add(field);
          return String(r[key] ?? '').trim();
        };

        const parsedRow = (fields: Record<string, unknown>) => ({
          ...Object.fromEntries(keys.filter(key => !consumed.has(key)).map(key => [key, r[key]])),
          ...Object.fromEntries(Object.entries(fields).filter(([field]) => supplied.has(field))),
        });

        if (type === 'contract') {
          const id = findVal('id', ['id', 'mã định danh']); // i18n-data
          const contract_number = findVal('contract_number', ['số hợp đồng', 'so hop dong', 'contract_number']); // i18n-data
          const title = findVal('title', ['tên', 'nội dung', 'title']); // i18n-data
          const party_a = findVal('party_a', ['bên a', 'party_a']) || 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII'; // i18n-data
          const party_b = findVal('party_b', ['bên b', 'đối tác', 'party_b']); // i18n-data
          const signed_date = findVal('signed_date', ['ngày ký', 'signed_date']) || new Date().toISOString().substring(0, 10); // i18n-data
          const start_date = findVal('start_date', ['ngày bắt đầu', 'ngày hiệu lực', 'start_date']) || signed_date; // i18n-data
          const end_date = findVal('end_date', ['ngày hết hạn', 'end_date']) || null; // i18n-data
          const valStr = findVal('value', ['giá trị', 'value']).replace(/[^\d.-]/g, ''); // i18n-data
          const value = valStr ? Number(valStr) || 0 : 0;
          const currency = findVal('currency', ['loại tiền', 'tiền tệ', 'currency']) || 'USD'; // i18n-data
          const department = findVal('department', ['phòng ban', 'bộ phận', 'department']) || 'HCNS'; // i18n-data
          const status = findVal('status', ['trạng thái', 'status']) || 'active'; // i18n-data
          const notes = findVal('notes', ['ghi chú', 'notes']) || null; // i18n-data

          if (!contract_number && !id) {
            errors.push({ row: rowNum, error: t.excelMissingContractNumber });
            return;
          }

          if (id) updateCount++;
          else newCount++;

          parsed.push(parsedRow({
            id: id || undefined,
            contract_number,
            title: title || 'Hợp đồng cập nhật qua Excel', // i18n-data
            party_a,
            party_b: party_b || 'Đối tác', // i18n-data
            signed_date,
            start_date,
            end_date: end_date && end_date !== 'null' ? end_date : null,
            value,
            currency,
            department,
            status,
            notes,
          }));
        }
      });

      setPreviewRows(parsed);
      setValidationErrors(errors);
      setServerPreview(null);
      setPreviewError(null);
      setAcceptUpdates(false);
      if (parsed.length > 0) {
        try {
          setServerPreview(await api.previewImport(type, parsed));
        } catch (err: any) {
          setPreviewError(err?.message || String(err));
        }
      }
      setStats({
        total: parsed.length,
        newCount,
        updateCount,
        errorCount: errors.length,
      });
    } catch (err) {
      setValidationErrors([{ row: 0, error: tf('excelReadFailed', { error: String(err) }) }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (previewRows.length === 0 || !serverPreview) return;
    setIsLoading(true);
    try {
      const res = await onImportConfirm(previewRows, { confirmUpdates: acceptUpdates, fileName: selectedFile?.name, previewFingerprint: serverPreview.preview_fingerprint });
      setResultMsg(tf('excelImportSuccess', { added: res.added, updated: res.updated }));
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      notify.error(tf('excelSaveFailed', { error: err?.message || String(err) }));
      setAcceptUpdates(false);
      setServerPreview(null);
      try {
        setServerPreview(await api.previewImport(type, previewRows));
      } catch (previewError) {
        setPreviewError(String(previewError));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 880,
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'var(--accent-primary)',
                color: 'var(--text-inverted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {type === 'contract' ? t.excelImportContractTitle : t.excelImportDocTitle}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                {t.excelImportDesc}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Download Template Bar */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: 'var(--bg-hover)',
              border: '1px dashed var(--border-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {t.noStandardTemplate}
            </div>
            <button
              onClick={handleDownloadTemplate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                background: 'var(--accent-primary)',
                color: 'var(--text-inverted)',
                border: 'none',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Download size={14} />
              <span>{t.downloadTemplate}</span>
            </button>
          </div>

          {/* Upload Area */}
          <div
            style={{
              border: '2px dashed var(--border-strong)',
              borderRadius: 10,
              padding: '24px',
              textAlign: 'center',
              background: 'var(--bg-input)',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                cursor: 'pointer',
                width: '100%',
                height: '100%',
              }}
            />
            <UploadCloud size={32} color="var(--accent-primary)" style={{ margin: '0 auto 8px auto' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedFile ? selectedFile.name : t.dragOrClickUpload}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {t.maxFileSize}
            </div>
          </div>

          {/* Validation Alerts */}
          {validationErrors.length > 0 && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #EF4444',
                color: '#EF4444',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} />
                <span>{t.detectedErrors} {validationErrors.length} {t.errorsInFile}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                {validationErrors.slice(0, 5).map((e, idx) => (
                  <li key={idx}>{tf('excelRowError', { row: e.row, error: e.error })}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Success Banner */}
          {resultMsg && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 8,
                background: 'rgba(159, 174, 74, 0.15)',
                border: '1px solid var(--success-dot)',
                color: 'var(--success-text)',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} />
              <span>{resultMsg}</span>
            </div>
          )}

          {previewError && <div className="inline-alert inline-alert-error">{previewError}</div>}
          {serverPreview && (
            <div className="import-preview">
              <div className="import-preview-chips">
                <span className="chip chip-new">{tf('importCreateCount', { count: serverPreview.summary.create })}</span>
                <span className="chip chip-update">{tf('importUpdateCount', { count: serverPreview.summary.update })}</span>
                <span className="chip">{tf('importUnchangedCount', { count: serverPreview.summary.unchanged })}</span>
                <span className="chip chip-warn">{tf('importDuplicateCount', { count: serverPreview.summary.duplicate_in_file })}</span>
                <span className="chip chip-error">{tf('importErrorCount', { count: serverPreview.summary.error })}</span>
              </div>
              {serverPreview.rows.filter((r) => r.action === 'error').length > 0 && (
                <ul className="import-preview-list">
                  {serverPreview.rows
                    .filter((r) => r.action === 'error')
                    .slice(0, 20)
                    .map((r) => (
                      <li key={r.index} className="import-row-error">
                        {tf('excelRowError', { row: r.index + 2, error: (r.errors || []).join('; ') })}
                      </li>
                    ))}
                </ul>
              )}
              {serverPreview.summary.update > 0 && (
                <>
                  <p className="import-preview-hint">{t.importUpdatesHint}</p>
                  <ul className="import-preview-list">
                    {serverPreview.rows
                      .filter((r) => r.action === 'update')
                      .slice(0, 50)
                      .map((r) => (
                        <li key={r.index}>
                          <strong>{r.key}</strong>:{' '}
                          {Object.entries(r.changes || {})
                            .slice(0, 6)
                            .map(([field, [before, after]]) => `${field}: "${before ?? ''}" → "${after ?? ''}"`)
                            .join('; ')}
                        </li>
                      ))}
                  </ul>
                  <label className="import-accept">
                    <input type="checkbox" checked={acceptUpdates} onChange={(e) => setAcceptUpdates(e.target.checked)} />
                    <span>{tf('importAcceptUpdates', { count: serverPreview.summary.update })}</span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* Preview Stats & Summary */}
          {previewRows.length > 0 && (
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  marginBottom: 10,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <div style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                  {t.previewTotal} <strong>{stats.total}</strong> {t.rowsUnit}
                </div>
                <div style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(159, 174, 74, 0.15)', color: 'var(--success-text)' }}>
                  {t.previewNew} <strong>{stats.newCount}</strong>
                </div>
                <div style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(252, 207, 77, 0.15)', color: 'var(--accent-primary)' }}>
                  {t.previewUpdate} <strong>{stats.updateCount}</strong>
                </div>
              </div>

              {/* Table Preview */}
              <div
                style={{
                  maxHeight: 240,
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ padding: '8px 12px' }}>STT</th>
                      <th style={{ padding: '8px 12px' }}>ID</th>
                      <th style={{ padding: '8px 12px' }}>{type === 'contract' ? t.contractNumberShort : t.documentNumberShort}</th>
                      <th style={{ padding: '8px 12px' }}>{t.titleOrSummary}</th>
                      <th style={{ padding: '8px 12px' }}>{t.actionColumn}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 10).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 12px' }}>{i + 1}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.id || '—'}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.contract_number || r.document_number}</td>
                        <td style={{ padding: '8px 12px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: r.id ? 'rgba(252, 207, 77, 0.15)' : 'rgba(159, 174, 74, 0.15)',
                              color: r.id ? 'var(--accent-primary)' : 'var(--success-text)',
                            }}
                          >
                            {r.id ? t.actionUpdate : t.actionAddNew}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewRows.length > 10 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                  {t.previewDisplaying} 10 / {previewRows.length} {t.recordsUnit}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            background: 'var(--bg-surface-subtle)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--border-strong)',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {t.cancel}
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={
              isLoading ||
              previewRows.length === 0 ||
              !serverPreview ||
              serverPreview.summary.error > 0 ||
              (serverPreview.summary.update > 0 && !acceptUpdates)
            }
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent-primary)',
              color: 'var(--text-inverted)',
              cursor: isLoading || previewRows.length === 0 || !serverPreview ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isLoading || previewRows.length === 0 ? 0.6 : 1,
            }}
          >
            {isLoading ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
            <span>{t.confirmImportBtn} ({previewRows.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
