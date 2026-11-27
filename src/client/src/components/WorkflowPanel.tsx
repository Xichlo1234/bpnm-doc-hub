import React, { useState } from 'react';
import { GitBranch, ArrowRight } from 'lucide-react';
import { api } from '../services/api.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { formatSystemDateTime } from '../utils/dateTime.ts';
import type { TranslationKey } from '../i18n/index.ts';
import { workflowKind, stagesFor, stageOf } from '../../../server/utils/workflow.ts';

interface WorkflowPanelProps {
  doc: any;
  canEdit: boolean;
  onUpdated: (doc: any) => void;
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({ doc, canEdit, onUpdated }) => {
  const { t, tf } = useLanguage();
  const kind = workflowKind(doc.doc_type);
  const [target, setTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ handler: doc.handler || '', due_date: doc.due_date || '', directive: '', signer: doc.signer || '', note: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!kind) return null;

  const stageLabel = (code: string) => t[`wfStage_${code}` as TranslationKey] || code;
  const stages = stagesFor(kind);
  const current = stageOf(kind, doc.status).code;
  const allowed: string[] = doc.allowed_transitions || [];

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload: any = { to: target, expected_revision: doc.revision ?? 0, note: form.note || undefined };
      if (target === 'assigned') Object.assign(payload, { handler: form.handler, due_date: form.due_date || undefined, directive: form.directive || undefined });
      if (target === 'signed') payload.signer = form.signer;
      const updated = await api.transitionDocument(doc.id, payload);
      setMessage({ ok: true, text: tf('wfDone', { status: updated.status }) });
      setTarget(null);
      onUpdated(updated);
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const log: any[] = doc.directive_log || [];
  const adjustments: any[] = doc.adjustments || [];

  return (
    <section className="workflow-panel" aria-label={t.wfTitle}>
      <h3>
        <GitBranch size={14} /> {t.wfTitle}
      </h3>
      <div className="workflow-steps">
        {stages.map((s) => (
          <span key={s.code} className={s.code === current ? 'workflow-step workflow-step-current' : 'workflow-step'}>
            {stageLabel(s.code)}
          </span>
        ))}
      </div>
      {canEdit && allowed.length > 0 && (
        <div className="workflow-actions">
          {allowed.map((code) => (
            <button key={code} type="button" className={target === code ? 'btn btn-sm btn-primary' : 'btn btn-sm'} onClick={() => setTarget(code)}>
              <ArrowRight size={13} />
              <span>{tf('wfMoveTo', { stage: stageLabel(code) })}</span>
            </button>
          ))}
        </div>
      )}
      {target && (
        <div className="workflow-form">
          {target === 'assigned' && (
            <>
              <label className="paper-location-item">
                <span>{t.wfHandler} *</span>
                <input className="form-input" value={form.handler} onChange={(e) => setForm({ ...form, handler: e.target.value })} />
              </label>
              <label className="paper-location-item">
                <span>{t.wfDueDate}</span>
                <input type="date" className="form-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </label>
              <label className="paper-location-item">
                <span>{t.wfDirective}</span>
                <input className="form-input" value={form.directive} onChange={(e) => setForm({ ...form, directive: e.target.value })} />
              </label>
            </>
          )}
          {target === 'signed' && (
            <label className="paper-location-item">
              <span>{t.wfSigner} *</span>
              <input className="form-input" value={form.signer} onChange={(e) => setForm({ ...form, signer: e.target.value })} />
            </label>
          )}
          <label className="paper-location-item">
            <span>{t.wfNote}</span>
            <input className="form-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={submit}>
              {t.wfConfirm}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setTarget(null)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {message && <div className={message.ok ? 'inline-alert inline-alert-success' : 'inline-alert inline-alert-error'}>{message.text}</div>}
      {log.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>{t.wfDirectiveLog}</h3>
          <ul className="workflow-log">
            {[...log].reverse().map((e, i) => (
              <li key={i}>
                <strong>{formatSystemDateTime(e.at)}</strong> · {e.by_name || e.by}
                {e.handler && <> · {t.wfHandler}: {e.handler}</>}
                {e.due_date && <> · {t.wfDueDate}: {e.due_date}</>}
                {e.directive && <div>{t.wfDirective}: {e.directive}</div>}
                {e.note && <div>{e.note}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      {adjustments.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>{t.wfAdjustments}</h3>
          <ul className="workflow-log">
            {[...adjustments].reverse().map((a, i) => (
              <li key={i}>
                <strong>{formatSystemDateTime(a.at)}</strong> · {a.by_name || a.by}: {a.reason}
                <div>
                  {Object.entries(a.fields || {})
                    .map(([f, [b, n]]: any) => `${f}: "${b ?? ''}" → "${n ?? ''}"`)
                    .join('; ')}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
