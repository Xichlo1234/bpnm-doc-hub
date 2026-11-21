import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, RefreshCw, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../services/api.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { formatSystemDateTime } from '../utils/dateTime.ts';
import { formatFileSize } from '../utils/fileSize.ts';
import type { AttachmentRecord } from '../../../server/types.ts';

interface AttachmentsPanelProps {
  recordType: 'document' | 'contract';
  recordId: string;
  canEdit: boolean;
  /** Revision of the record as loaded; sent with every change (optimistic concurrency) */
  recordRevision: number;
  /** Called with the updated record after a change, so the parent can refresh its copy. */
  onRecordChanged?: (record: any) => void;
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.svg,.txt,.zip';

export const AttachmentsPanel: React.FC<AttachmentsPanelProps> = ({ recordType, recordId, canEdit, recordRevision, onRecordChanged }) => {
  const { t, tf } = useLanguage();
  const [items, setItems] = useState<AttachmentRecord[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const load = async () => {
    try {
      setItems(await api.getAttachments(recordType, recordId, showVersions));
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || t.attFailed });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, recordId, showVersions]);

  const pick = (replaces: string | null) => {
    replaceTarget.current = replaces;
    fileInput.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(replaceTarget.current || 'new');
    setProgress(0);
    setMessage(null);
    try {
      // Success is shown only after the server confirmed both the file and the record
      const res = await api.addAttachment(recordType, recordId, file, {
        expectedRevision: recordRevision,
        replaces: replaceTarget.current || undefined,
        onProgress: setProgress,
      });
      setMessage({ ok: true, text: tf('attSaved', { name: file.name }) });
      onRecordChanged?.(res.record);
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || t.attFailed });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (att: AttachmentRecord) => {
    if (!window.confirm(tf('attRemoveConfirm', { name: att.original_name }))) return;
    setBusy(att.id);
    try {
      const res = await api.removeAttachment(att.id, recordRevision);
      setMessage({ ok: true, text: t.attRemoved });
      onRecordChanged?.(res.record);
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || t.attFailed });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="attachments-panel" aria-label={t.attTitle}>
      <div className="attachments-panel-header">
        <h3>
          <Paperclip size={14} /> {t.attTitle}
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={() => setShowVersions((v) => !v)}>
            {showVersions ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{showVersions ? t.attHideVersions : t.attShowVersions}</span>
          </button>
          {canEdit && (
            <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(busy)} onClick={() => pick(null)}>
              <Upload size={13} />
              <span>{busy === 'new' ? `${t.attUploading} ${progress}%` : t.attAdd}</span>
            </button>
          )}
        </div>
      </div>
      <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={onFile} />
      {message && (
        <div className={message.ok ? 'inline-alert inline-alert-success' : 'inline-alert inline-alert-error'} role="status">
          {message.text}
        </div>
      )}
      {items.length === 0 ? (
        <p className="attachments-empty">{t.attEmpty}</p>
      ) : (
        <ul className="attachments-list">
          {items.map((att) => (
            <li key={att.id} className={att.is_current ? '' : 'attachment-old-version'}>
              <div className="attachment-main">
                <a href={`/api/files/${att.file_key}`} target="_blank" rel="noopener noreferrer" className="attachment-name">
                  <Download size={13} /> {att.original_name}
                </a>
                <span className="attachment-meta">
                  {tf('attVersion', { version: att.version })} · {formatFileSize(att.size)} ·{' '}
                  {tf('attUploadedBy', { user: att.uploaded_by, time: formatSystemDateTime(att.uploaded_at) })}
                </span>
                {att.sha256 && (
                  <span className="attachment-meta" title={t.attChecksum}>
                    SHA-256: <code>{att.sha256.slice(0, 16)}…</code>
                  </span>
                )}
              </div>
              {canEdit && att.is_current && (
                <div className="attachment-actions">
                  <button type="button" className="btn-icon" title={t.attReplace} disabled={Boolean(busy)} onClick={() => pick(att.id)}>
                    <RefreshCw size={13} />
                  </button>
                  <button type="button" className="btn-icon" title={t.attRemove} disabled={Boolean(busy)} onClick={() => remove(att)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
