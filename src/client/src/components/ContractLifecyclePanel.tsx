import React, { useState } from 'react';
import { FilePlus2, Ban } from 'lucide-react';
import { api } from '../services/api.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { formatCurrencyValue } from '../utils/currency.ts';

interface Props {
  contract: any;
  canEdit: boolean;
  isAdmin: boolean;
  onUpdated: (contract: any) => void;
}

const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export const ContractLifecyclePanel: React.FC<Props> = ({ contract, canEdit, isAdmin, onUpdated }) => {
  const { t, tf } = useLanguage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ appendix_number: '', title: '', signed_date: today(), new_end_date: '', new_value: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const appendices: any[] = contract.appendices || [];

  const save = async () => {
    setMessage(null);
    try {
      const res = await api.addContractAppendix(contract.id, {
        appendix_number: form.appendix_number,
        title: form.title,
        signed_date: form.signed_date,
        new_end_date: form.new_end_date || null,
        new_value: form.new_value === '' ? null : Number(form.new_value),
      });
      setMessage({ ok: true, text: tf('ctAppendixSaved', { number: res.appendix.appendix_number }) });
      setOpen(false);
      setForm({ appendix_number: '', title: '', signed_date: today(), new_end_date: '', new_value: '' });
      onUpdated(res.contract);
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message });
    }
  };

  const terminate = async () => {
    const reason = window.prompt(t.ctTerminateReason);
    if (!reason) return;
    try {
      onUpdated(await api.terminateContract(contract.id, { reason, date: today() }));
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message });
    }
  };

  return (
    <section className="workflow-panel" aria-label={t.ctAppendices}>
      <div className="attachments-panel-header">
        <h3>
          <FilePlus2 size={14} /> {t.ctAppendices}
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {canEdit && contract.status === 'active' && (
            <button type="button" className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
              {t.ctAddAppendix}
            </button>
          )}
          {isAdmin && contract.status === 'active' && (
            <button type="button" className="btn btn-sm btn-danger" onClick={terminate}>
              <Ban size={13} />
              <span>{t.ctTerminate}</span>
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="workflow-form">
          {(
            [
              ['appendix_number', t.ctAppendixNumber, 'text'],
              ['title', t.ctAppendixTitle, 'text'],
              ['signed_date', t.ctAppendixSigned, 'date'],
              ['new_end_date', t.ctAppendixNewEnd, 'date'],
              ['new_value', t.ctAppendixNewValue, 'number'],
            ] as const
          ).map(([field, label, type]) => (
            <label key={field} className="paper-location-item">
              <span>{label}</span>
              <input type={type} className="form-input" value={(form as any)[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
            </label>
          ))}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={save}>
              {t.wfConfirm}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {message && <div className={message.ok ? 'inline-alert inline-alert-success' : 'inline-alert inline-alert-error'}>{message.text}</div>}
      {appendices.length === 0 ? (
        <p className="attachments-empty">{t.ctNoAppendices}</p>
      ) : (
        <ul className="workflow-log">
          {appendices.map((a) => (
            <li key={a.id}>
              <strong>{a.appendix_number}</strong> · {a.signed_date} · {a.title}
              {a.new_end_date && (
                <div>
                  {t.ctAppendixNewEnd}: {a.previous_end_date || '—'} → {a.new_end_date}
                </div>
              )}
              {a.new_value !== null && a.new_value !== undefined && (
                <div>
                  {t.ctAppendixNewValue}: {formatCurrencyValue(a.previous_value, contract.currency)} → {formatCurrencyValue(a.new_value, contract.currency)}{' '}
                  {contract.currency}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
