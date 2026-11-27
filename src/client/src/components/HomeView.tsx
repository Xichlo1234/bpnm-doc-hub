import { useMemo } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, Clock3, FileText, Plus, Search, UserRound } from 'lucide-react';
import type { ContractRecord, DocumentRecord } from '../../../server/types.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { documentTypeLabel } from '../i18n/documentTypeLabel.ts';
import { parseSystemDate } from '../utils/dateTime.ts';
import type { UnifiedItem } from './ItemList.tsx';
import type { NavFilter } from './Sidebar.tsx';
import { WorkspaceCalendar } from './WorkspaceCalendar.tsx';
import '../../styles/home.css';

interface HomeViewProps {
  name?: string;
  documents: DocumentRecord[];
  contracts: ContractRecord[];
  isLoading: boolean;
  hasError: boolean;
  countFor: (filter: NavFilter) => number;
  onSelectFilter: (filter: NavFilter) => void;
  onSelectItem: (item: UnifiedItem) => void;
  onSearch: () => void;
  onRetry: () => void;
  onCreateDocument?: () => void;
}

const SUMMARY = [
  { filter: 'docs_incoming', label: 'incomingDoc', icon: ArrowDownLeft, tone: 'green' },
  { filter: 'docs_outgoing', label: 'outgoingDoc', icon: ArrowUpRight, tone: 'blue' },
  { filter: 'docs_incoming_overdue', label: 'overdueStat', icon: Clock3, tone: 'red' },
  { filter: 'contracts_all', label: 'homeEconomicContracts', icon: BriefcaseBusiness, tone: 'amber' },
] as const;

const ATTENTION = [
  { filter: 'docs_incoming_unassigned', label: 'homeUnassignedDocuments', icon: UserRound, tone: 'blue' },
  { filter: 'docs_incoming_expiring', label: 'homeExpiringDocuments', icon: CalendarDays, tone: 'red' },
  { filter: 'contracts_urgent', label: 'homeUrgentContracts', icon: BriefcaseBusiness, tone: 'amber' },
] as const;

const LOCALES = { vi: 'vi-VN', en: 'en-GB', km: 'km-KH' };
const VN_TIME = 'Asia/Ho_Chi_Minh';

export function HomeView({ name, documents, contracts, isLoading, hasError, countFor, onSelectFilter, onSelectItem, onSearch, onRetry, onCreateDocument }: HomeViewProps) {
  const { t, tf, language } = useLanguage();
  const locale = LOCALES[language];
  const dateFormatter = new Intl.DateTimeFormat(locale, { timeZone: VN_TIME, day: 'numeric', month: 'short', year: 'numeric' });
  const numberFormatter = new Intl.NumberFormat(locale);
  const dataUnavailable = isLoading || hasError;

  const recent = useMemo(() => {
    const items: UnifiedItem[] = [
      ...documents.map((document): UnifiedItem => ({ kind: 'document', data: document })),
      ...contracts.map((contract): UnifiedItem => ({ kind: 'contract', data: contract })),
    ];
    return items.map((item) => ({
      item,
      date: parseSystemDate(item.data.updated_at) ?? parseSystemDate(item.data.created_at),
    })).sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0)).slice(0, 5);
  }, [documents, contracts]);

  const count = (filter: NavFilter) => dataUnavailable ? '—' : numberFormatter.format(countFor(filter));

  return (
    <main className="home-page" aria-labelledby="home-title">
      <div className="home-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <WorkspaceCalendar />
            <h1 id="home-title">{t.homeTitle}</h1>
            {name && <p>{tf('homeWelcome', { name })}</p>}
            <div className="home-hero-actions">
              <button type="button" className="home-primary" onClick={onCreateDocument ?? onSearch}>
                {onCreateDocument ? <Plus size={18} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
                {onCreateDocument ? t.createIncomingBtn : t.homeSearch}
              </button>
              <button type="button" className="home-secondary" onClick={() => onSelectFilter('all')}>
                {t.homeAllRecords}<ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        {hasError && (
          <div className="home-feedback" role="alert">
            <span>{t.homeLoadError}</span>
            <button type="button" className="home-text-action" onClick={onRetry}>{t.homeRetry}</button>
          </div>
        )}

        <section className="home-metrics" aria-label={t.navTopOverview} aria-busy={isLoading}>
          {SUMMARY.map(({ filter, label, icon: Icon, tone }) => (
            <button key={filter} type="button" className="home-metric" onClick={() => onSelectFilter(filter)}>
              <span className={`home-icon home-tone-${tone}`}><Icon size={19} aria-hidden="true" /></span>
              <ArrowUpRight size={17} className="home-row-arrow" aria-hidden="true" />
              <strong>{count(filter)}</strong>
              <span className="home-metric-label">{t[label]}</span>
            </button>
          ))}
        </section>

        <div className="home-panels">
          <section className="home-panel" aria-labelledby="home-recent" aria-busy={isLoading}>
            <div className="home-panel-heading">
              <h2 id="home-recent">{t.homeRecent}</h2>
              <button type="button" className="home-text-action" onClick={() => onSelectFilter('all')}>
                {t.homeViewAll}<ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
            {isLoading ? <p role="status" className="home-empty">{t.appLoadingSystem}</p>
              : hasError ? null : recent.length === 0 ? <p className="home-empty">{t.homeEmpty}</p>
              : <ul className="home-list">
                {recent.map(({ item, date }) => {
                  const number = item.kind === 'contract' ? item.data.contract_number : item.data.document_number;
                  const label = item.kind === 'contract' ? t.contractWord : documentTypeLabel(t, item.data.doc_type);
                  return (
                    <li key={`${item.kind}:${item.data.id}`}>
                      <button type="button" className="home-record" onClick={() => onSelectItem(item)}>
                        <span className={`home-icon home-tone-${item.kind === 'contract' ? 'amber' : 'green'}`}>
                          {item.kind === 'contract' ? <BriefcaseBusiness size={16} aria-hidden="true" /> : <FileText size={17} aria-hidden="true" />}
                        </span>
                        <span className="home-record-meta">
                          <strong>{item.data.title || number}</strong>
                          <span>{[number, label].filter(Boolean).join(' · ')}</span>
                        </span>
                        {date && <time dateTime={date.toISOString()}>{dateFormatter.format(date)}</time>}
                        <ArrowUpRight size={16} className="home-row-arrow" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>}
          </section>

          <section className="home-panel home-attention" aria-labelledby="home-attention" aria-busy={isLoading}>
            <div className="home-panel-heading"><h2 id="home-attention">{t.homeAttention}</h2></div>
            <ul className="home-list">
              {ATTENTION.map(({ filter, label, icon: Icon, tone }) => (
                <li key={filter}>
                  <button type="button" className="home-attention-row" onClick={() => onSelectFilter(filter)}>
                    <span className={`home-icon home-tone-${tone}`}><Icon size={17} aria-hidden="true" /></span>
                    <span>{t[label]}</span>
                    <span className="home-attention-count">{count(filter)}</span>
                    <ArrowRight size={15} className="home-row-arrow" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
