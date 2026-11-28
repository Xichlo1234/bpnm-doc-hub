import { useState } from 'react';
import { ArrowUpRight, BookOpen, Smartphone } from 'lucide-react';
import { CodeWizard } from './CodeWizard';
import { guide as g } from '../i18n/guide.vi';
import type { DocumentRecord } from '../../../server/types';

export function GuideView({
  documents,
  loading,
  failed,
  onInstall,
}: {
  documents: DocumentRecord[];
  loading: boolean;
  failed: boolean;
  onInstall: () => void;
}) {
  const [section, setSection] = useState(0);
  return (
    <main className="guide-scroll" lang="vi">
      <article className="guide-page">
        <header className="guide-heading">
          <div className="guide-kicker">
            <BookOpen size={16} />
            {g.source}
          </div>
          <h1>{g.title}</h1>
          <p>{g.intro}</p>
        </header>
        <nav className="guide-tabs" aria-label={g.title}>
          {g.tabs.map((tab, i) => (
            <button key={tab} aria-pressed={i === section} onClick={() => setSection(i)}>
              {tab}
            </button>
          ))}
        </nav>
        {section === 0 ? (
          <section>
            <h2>{g.rulesTitle}</h2>
            <ol className="guide-rules">
              {g.rules.map(([title, body, example], i) => (
                <li key={title} className={'guide-card' + (i === 4 ? ' emphasis' : '')}>
                  <span className="rule-number">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                    <code>{example}</code>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : section === 1 ? (
          <section className="guide-card">
            <h2>{g.structure}</h2>
            <code className="guide-code">{g.format}</code>
            <ol className="guide-blocks">
              {g.parts.map(([value, label]) => (
                <li key={label}>
                  <strong>{value}</strong>
                  <small>{label}</small>
                </li>
              ))}
            </ol>
            <code className="guide-code">{g.example}</code>
            <ul className="guide-notes">
              {g.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={() => setSection(2)}>
              {g.practice}
              <ArrowUpRight size={16} />
            </button>
          </section>
        ) : (
          <CodeWizard records={documents} recordStatus={loading ? 'loading' : failed ? 'error' : 'ready'} />
        )}
        <aside className="guide-install-link">
          <Smartphone />
          <div>
            <h3>{g.installHeading}</h3>
            <p>{g.installBrief}</p>
          </div>
          <button className="btn btn-ghost" onClick={onInstall}>
            {g.install}
            <ArrowUpRight size={16} />
          </button>
        </aside>
      </article>
    </main>
  );
}
