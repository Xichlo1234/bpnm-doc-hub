import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '../services/api.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { formatSystemDateTime } from '../utils/dateTime.ts';
import type { TranslationKey } from '../i18n/index.ts';

const ACTION_KEYS: Record<string, TranslationKey> = {
  create: 'histActionCreate',
  update: 'histActionUpdate',
  delete: 'histActionDelete',
  restore: 'histActionRestore',
  import: 'histActionImport',
  attach: 'histActionAttach',
  replace_file: 'histActionReplaceFile',
  detach: 'histActionDetach',
  purge: 'histActionPurge',
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export const HistoryPanel: React.FC<{ recordType: 'document' | 'contract'; recordId: string; refreshKey?: unknown }> = ({
  recordType,
  recordId,
  refreshKey,
}) => {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getHistory(recordType, recordId)
      .then((h) => !cancelled && setEntries(h))
      .catch((err) => !cancelled && setError(err?.message || t.histLoadFailed));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, recordId, refreshKey]);

  return (
    <section className="history-panel" aria-label={t.histTitle}>
      <h3>
        <History size={14} /> {t.histTitle}
      </h3>
      {error && <div className="inline-alert inline-alert-error">{error}</div>}
      {entries && entries.length === 0 && <p className="attachments-empty">{t.histEmpty}</p>}
      {entries && entries.length > 0 && (
        <ol className="history-list">
          {entries.map((h) => (
            <li key={h.id}>
              <div className="history-head">
                <strong>{ACTION_KEYS[h.action] ? t[ACTION_KEYS[h.action]] : h.action}</strong>
                <span>
                  {h.changed_by_name || h.changed_by} · {formatSystemDateTime(h.changed_at)}
                </span>
              </div>
              {h.changes && h.action !== 'create' && h.action !== 'import' && (
                <table className="history-changes">
                  <thead>
                    <tr>
                      <th>{t.histField}</th>
                      <th>{t.histBefore}</th>
                      <th>{t.histAfter}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(h.changes as Record<string, [unknown, unknown]>).map(([field, [before, after]]) => (
                      <tr key={field}>
                        <td>
                          <code>{field}</code>
                        </td>
                        <td>{show(before)}</td>
                        <td>{show(after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
