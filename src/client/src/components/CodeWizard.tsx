import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react';
import { api } from '../services/api';
import { guide as g } from '../i18n/guide.vi';
import { composeCode, suggestSuffix, type CodeFields } from '../utils/guideCode';
import { getNormalizedDocTypes, getUnifiedContractDepartments } from '../utils/categoryHelpers';
import type { DocumentRecord } from '../../../server/types';

const exercise: CodeFields = {
  date: '2025-06-20',
  department: 'ENV',
  type: 'EIA',
  number: '123',
  summary: g.summarySample,
};
const blank: CodeFields = { date: '', department: '', type: '', number: '', summary: '' };
interface Option {
  code: string;
  name: string;
}

export function CodeWizard({
  records,
  recordStatus,
}: {
  records: DocumentRecord[];
  recordStatus: 'loading' | 'error' | 'ready';
}) {
  const [sample, setSample] = useState(true);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState(exercise);
  const [catalog, setCatalog] = useState<{ departments: Option[]; types: Option[] }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [useSuffix, setUseSuffix] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  useEffect(() => {
    if (sample) return;
    let active = true;
    setFailed(false);
    api
      .getCategories()
      .then((data) => {
        const departments = new Map<string, Option>();
        for (const label of getUnifiedContractDepartments(data)) {
          const match = /^(\S+) - (.+)$/.exec(label);
          if (match && !departments.has(match[1]))
            departments.set(match[1], { code: match[1], name: match[2] });
        }
        if (active)
          setCatalog({
            departments: [...departments.values()],
            types: getNormalizedDocTypes(data).filter((t) => t.code),
          });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [sample, attempt]);

  const departments = sample ? [{ code: 'ENV', name: g.env }] : (catalog?.departments ?? []);
  const types = sample ? [{ code: 'EIA', name: g.eia }] : (catalog?.types ?? []);
  const { code, warnings } = composeCode(fields);
  const suffix =
    sample || recordStatus !== 'ready'
      ? ''
      : suggestSuffix(
          fields,
          records,
          departments.find((d) => d.code === fields.department)?.name ?? fields.department,
          types.find((t) => t.code === fields.type)?.name ?? fields.type
        );
  const result = code + (useSuffix ? suffix : '');
  const valid = [!warnings.includes('date'), true, !!fields.department, !!fields.type, !!code][step];
  const update = (key: keyof CodeFields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    setCopyStatus('');
    setUseSuffix(false);
  };
  const switchMode = (toSample: boolean) => {
    setSample(toSample);
    setFields(toSample ? exercise : blank);
    setStep(0);
    setCopyStatus('');
    setUseSuffix(false);
  };
  async function copy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopyStatus(g.copied);
    } catch {
      setCopyStatus(g.copyError);
    }
  }
  return (
    <section className="guide-card wizard">
      <div className="guide-mode">
        {[g.sample, g.live].map((label, i) => (
          <button key={label} aria-pressed={sample === (i === 0)} onClick={() => switchMode(i === 0)}>
            {label}
          </button>
        ))}
      </div>
      {sample && (
        <p>
          {g.scenario} {g.sampleNote}
        </p>
      )}
      <ol className="wizard-progress">
        {g.steps.map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? 'step' : undefined}
            className={i <= step ? 'reached' : ''}
          >
            <span>{i < step ? <Check size={14} /> : i + 1}</span>
            <small>{label}</small>
          </li>
        ))}
      </ol>
      <h2>
        {step + 1}. {g.steps[step]}
      </h2>
      {step === 0 && (
        <label>
          {g.date}
          <input type="date" value={fields.date} onChange={(e) => update('date', e.target.value)} />
        </label>
      )}
      {step === 1 && (
        <>
          <code className="guide-code">_SGII</code>
          <p>{g.fixed}</p>
        </>
      )}
      {(step === 2 || step === 3) &&
        (() => {
          const key = step === 2 ? 'department' : 'type';
          const options = step === 2 ? departments : types;
          return (
            <>
              <label>
                {g.steps[step]}
                <select value={fields[key]} onChange={(e) => update(key, e.target.value)}>
                  <option value="">{g.choose}</option>
                  {options.map((o) => (
                    <option key={o.code + o.name} value={o.code}>
                      {o.code} — {o.name}
                    </option>
                  ))}
                </select>
              </label>
              {!sample && !options.length && (
                <p role="status">
                  {failed ? g.failed : catalog ? g.empty : g.loading}
                  {failed && <button onClick={() => setAttempt((v) => v + 1)}>{g.retry}</button>}
                </p>
              )}
            </>
          );
        })()}
      {step === 4 && (
        <>
          <div className="wizard-fields">
            <label>
              {g.number}
              <input value={fields.number} onChange={(e) => update('number', e.target.value)} />
            </label>
            <label>
              {g.summary}
              <input value={fields.summary} onChange={(e) => update('summary', e.target.value)} />
            </label>
          </div>
          <p>{g.summaryHint}</p>
          {!sample && recordStatus !== 'ready' && (
            <p role="status">{recordStatus === 'error' ? g.recordsError : g.checking}</p>
          )}
          {suffix && (
            <label className="suffix">
              <input
                type="checkbox"
                checked={useSuffix}
                onChange={(e) => {
                  setUseSuffix(e.target.checked);
                  setCopyStatus('');
                }}
              />
              {g.duplicate} {suffix}
            </label>
          )}
          <div className="wizard-result">
            <h3>{g.result}</h3>
            <output>{result || '…'}</output>
          </div>
        </>
      )}
      {warnings
        .filter((w) => step === 4 || (step === 0 && w === 'date'))
        .map((w) => (
          <p className="guide-warning" key={w}>
            {g.warnings[w]}
          </p>
        ))}
      <div className="wizard-actions">
        <button className="btn btn-ghost" disabled={!step} onClick={() => setStep(step - 1)}>
          <ArrowLeft size={16} />
          {g.prev}
        </button>
        {step < 4 ? (
          <button className="btn btn-primary" disabled={!valid} onClick={() => setStep(step + 1)}>
            {g.next}
            <ArrowRight size={16} />
          </button>
        ) : (
          <button className="btn btn-primary" disabled={!code} onClick={copy}>
            <Copy size={16} />
            {g.copy}
          </button>
        )}
      </div>
      <span role="status">{copyStatus}</span>
    </section>
  );
}
