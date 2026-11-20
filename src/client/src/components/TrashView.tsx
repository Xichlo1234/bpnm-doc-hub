import React, { useEffect, useState } from 'react';
import { Trash2, RotateCcw, ShieldCheck } from 'lucide-react';
import { api } from '../services/api.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { formatSystemDateTime } from '../utils/dateTime.ts';

type Kind = 'document' | 'contract' | 'partner';

interface Row {
  kind: Kind;
  id: string;
  title: string;
  number: string;
  deleted_at: string;
}

export const TrashView: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const { t, tf } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [recon, setRecon] = useState<Awaited<ReturnType<typeof api.storageCheck>> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getTrash();
      setRows(
        [
          ...data.documents.map((d) => ({ kind: 'document' as Kind, id: d.id, title: d.title, number: d.document_number, deleted_at: d.deleted_at })),
          ...data.contracts.map((c) => ({ kind: 'contract' as Kind, id: c.id, title: c.title, number: c.contract_number, deleted_at: c.deleted_at })),
          ...data.partners.map((p) => ({ kind: 'partner' as Kind, id: p.id, title: p.name_vn, number: p.code, deleted_at: p.deleted_at })),
        ].sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)))
      );
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const kindLabel = (k: Kind) => (k === 'document' ? t.trashKindDocument : k === 'contract' ? t.trashKindContract : t.trashKindPartner);

  const restore = async (r: Row) => {
    try {
      await api.restoreFromTrash(r.kind, r.id);
      setMessage({ ok: true, text: tf('trashRestored', { title: r.number || r.title }) });
      await load();
      onChanged?.();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message });
    }
  };

  const purge = async (r: Row) => {
    if (!window.confirm(tf('trashPurgeConfirm', { title: r.number || r.title }))) return;
    try {
      await api.purgeFromTrash(r.kind, r.id);
      setMessage({ ok: true, text: tf('trashPurged', { title: r.number || r.title }) });
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message });
    }
  };

  const runCheck = async () => {
    try {
      setRecon(await api.storageCheck());
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || t.reconFailed });
    }
  };

  return (
    <div className="trash-view">
      <div className="trash-header">
        <div>
          <h2>
            <Trash2 size={18} /> {t.trashTitle}
          </h2>
          <p>{t.trashSubtitle}</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={runCheck}>
          <ShieldCheck size={14} />
          <span>{t.reconRun}</span>
        </button>
      </div>
      {message && <div className={message.ok ? 'inline-alert inline-alert-success' : 'inline-alert inline-alert-error'}>{message.text}</div>}
      {recon && (
        <div className={recon.ok ? 'inline-alert inline-alert-success' : 'inline-alert inline-alert-error'}>
          <strong>{t.reconTitle}: </strong>
          {recon.ok ? (
            t.reconOk
          ) : (
            <>
              {tf('reconMissing', { count: recon.missing.length })}; {tf('reconOrphans', { count: recon.orphans.length })}
              {recon.missing.length > 0 && <pre className="recon-list">{recon.missing.join('\n')}</pre>}
              {recon.orphans.length > 0 && <pre className="recon-list">{recon.orphans.map((o) => o.key).join('\n')}</pre>}
            </>
          )}
        </div>
      )}
      {!loading && rows.length === 0 ? (
        <p className="attachments-empty">{t.trashEmpty}</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.trashColKind}</th>
                <th>{t.trashColNumber}</th>
                <th>{t.trashColTitle}</th>
                <th>{t.trashDeletedAt}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}:${r.id}`}>
                  <td>{kindLabel(r.kind)}</td>
                  <td>
                    <code>{r.number}</code>
                  </td>
                  <td>{r.title}</td>
                  <td>{formatSystemDateTime(r.deleted_at)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-sm" onClick={() => restore(r)}>
                      <RotateCcw size={13} />
                      <span>{t.trashRestore}</span>
                    </button>{' '}
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => purge(r)}>
                      <Trash2 size={13} />
                      <span>{t.trashPurge}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
