import React from 'react';
import {
  Layers,
  FileCheck,
  AlertCircle,
  Clock,
  CheckCircle,
  FileText,
  House,
  ArrowDownLeft,
  ArrowUpRight,
  Bookmark,
  Building2,
  UploadCloud,
  Archive,
  AlertTriangle,
  UserCheck,
  SlidersHorizontal,
  Lock,
  PenLine,
  X,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { canAccessLaborContracts } from '../../../server/types.ts';
import type { TranslationKey } from '../i18n/index.ts';

export type NavFilter =
  | 'home'
  | 'all'
  | 'contracts_all'
  | 'contracts_urgent'
  | 'contracts_warning'
  | 'contracts_active'
  | 'contracts_expired'
  | 'contracts_liquidated'
  | 'contracts_indefinite'
  | 'labor_all'
  | 'labor_urgent'
  | 'labor_warning'
  | 'labor_active'
  | 'labor_expired'
  | 'labor_liquidated'
  | 'labor_indefinite'
  | 'docs_all'
  | 'docs_incoming'
  | 'docs_incoming_overdue'
  | 'docs_incoming_expiring'
  | 'docs_incoming_processing'
  | 'docs_incoming_completed'
  | 'docs_incoming_unassigned'
  | 'docs_outgoing'
  | 'docs_outgoing_draft'
  | 'docs_outgoing_sent'
  | 'docs_outgoing_signing'
  | 'docs_decision'
  | 'docs_internal'
  | 'archive'
  | 'partners_all'
  | 'settings_all';

interface NavItem {
  filter: NavFilter;
  label: TranslationKey;
  icon: LucideIcon;
  color?: string;
  /** Filters that should also highlight this item */
  alsoActive?: NavFilter[];
  /** Hide the count badge (e.g. settings) */
  noCount?: boolean;
}

interface NavGroup {
  id: string;
  title: TranslationKey;
  items: NavItem[];
  when?: 'labor' | 'admin';
}

// One entry per destination: every list appears exactly once in the menu.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    title: 'navOverview',
    items: [
      { filter: 'all', label: 'allRecords', icon: Layers },
      { filter: 'docs_all', label: 'navAllDocs', icon: FileText },
    ],
  },
  {
    id: 'incoming',
    title: 'incomingLog',
    items: [
      { filter: 'docs_incoming', label: 'allIncomingDocs', icon: ArrowDownLeft, color: 'var(--accent-primary)' },
      { filter: 'docs_incoming_overdue', label: 'overdueDocs', icon: AlertCircle, color: 'var(--urgent-dot)' },
      { filter: 'docs_incoming_expiring', label: 'expiringSoon3d', icon: AlertTriangle, color: '#EA580C' },
      { filter: 'docs_incoming_processing', label: 'inProgress', icon: Clock, color: '#3B82F6' },
      { filter: 'docs_incoming_unassigned', label: 'unassigned', icon: UserCheck, color: 'var(--text-muted)' },
      { filter: 'docs_incoming_completed', label: 'completed', icon: CheckCircle, color: 'var(--success-dot)' },
    ],
  },
  {
    id: 'outgoing',
    title: 'outgoingLog',
    items: [
      { filter: 'docs_outgoing', label: 'allOutgoingDocs', icon: ArrowUpRight, color: '#6366F1' },
      { filter: 'docs_outgoing_draft', label: 'navOutgoingDraft', icon: PenLine, color: 'var(--text-muted)' },
      { filter: 'docs_outgoing_signing', label: 'pendingSignature', icon: Clock, color: '#EA580C' },
      { filter: 'docs_outgoing_sent', label: 'dispatched', icon: CheckCircle, color: 'var(--success-dot)' },
    ],
  },
  {
    id: 'internal',
    title: 'internalAndDecisions',
    items: [{ filter: 'docs_internal', label: 'internalDocsDecisions', icon: FileText, color: '#059669', alsoActive: ['docs_decision'] }],
  },
  {
    id: 'contracts',
    title: 'economicContractsNavTitle',
    items: [
      { filter: 'contracts_all', label: 'allContracts', icon: FileCheck },
      { filter: 'contracts_urgent', label: 'urgentContracts7d', icon: AlertCircle, color: 'var(--urgent-dot)' },
      { filter: 'contracts_warning', label: 'expiringSoon30d', icon: Clock, color: 'var(--warning-dot)' },
      { filter: 'contracts_active', label: 'activeContractsNav', icon: CheckCircle, color: 'var(--success-dot)' },
      { filter: 'contracts_indefinite', label: 'indefiniteNav', icon: Bookmark, color: 'var(--text-muted)' },
      { filter: 'contracts_expired', label: 'expiredContractsNav', icon: AlertCircle, color: 'var(--urgent-dot)' },
      { filter: 'contracts_liquidated', label: 'liquidatedClosed', icon: Archive },
    ],
  },
  {
    id: 'labor',
    title: 'laborContractsNavTitle',
    when: 'labor',
    items: [
      { filter: 'labor_all', label: 'laborAll', icon: Lock, color: '#F59E0B' },
      { filter: 'labor_urgent', label: 'laborUrgentRenewal', icon: AlertCircle, color: 'var(--urgent-dot)' },
      { filter: 'labor_warning', label: 'laborExpiringSoon', icon: Clock, color: 'var(--warning-dot)' },
      { filter: 'labor_active', label: 'laborActiveFixedTerm', icon: CheckCircle, color: 'var(--success-dot)' },
      { filter: 'labor_indefinite', label: 'laborIndefinite', icon: Bookmark, color: '#3B82F6' },
      { filter: 'labor_expired', label: 'laborExpired', icon: AlertCircle, color: 'var(--urgent-dot)' },
      { filter: 'labor_liquidated', label: 'laborTerminated', icon: Archive },
    ],
  },
  {
    id: 'partners',
    title: 'partnersNavTitle',
    items: [{ filter: 'partners_all', label: 'partnerDirectory', icon: Building2, color: '#D97706' }],
  },
  {
    id: 'archive',
    title: 'navArchiveTitle',
    items: [{ filter: 'archive', label: 'navArchive', icon: Archive, color: '#64748B' }],
  },
  {
    id: 'admin',
    title: 'navAdminTitle',
    items: [{ filter: 'settings_all', label: 'navAdminSettings', icon: SlidersHorizontal, color: '#6366F1', noCount: true }],
  },
];

/**
 * The compact menu: six top-level entries. "Công văn" and "Hợp đồng" open into their registers; the
 * current list opens its own section. Status filters stay behind separate controls.
 */
interface TopEntry {
  id: string;
  label: TranslationKey;
  icon: LucideIcon;
  /** Direct destination (no children) */
  filter?: NavFilter;
  /** Groups shown inside this entry */
  groups?: string[];
  noCount?: boolean;
}

export const TOP_ENTRIES: TopEntry[] = [
  { id: 'overview', label: 'homeNav', icon: House, filter: 'home', noCount: true },
  { id: 'documents', label: 'navTopDocuments', icon: FileText, groups: ['docs_all', 'incoming', 'outgoing', 'internal'] },
  { id: 'contracts', label: 'navTopContracts', icon: FileCheck, groups: ['contracts', 'labor'] },
  { id: 'partners', label: 'navTopPartners', icon: Building2, filter: 'partners_all' },
  { id: 'archive', label: 'navTopArchive', icon: Archive, filter: 'archive' },
  { id: 'admin', label: 'navTopAdmin', icon: SlidersHorizontal, filter: 'settings_all', noCount: true },
];

// "Tất cả văn bản" sits at the top of the documents section
const DOCS_ALL_GROUP: NavGroup = { id: 'docs_all', title: 'navAllDocs', items: [{ filter: 'docs_all', label: 'navAllDocs', icon: FileText }] };
const groupById = (id: string): NavGroup | undefined => (id === 'docs_all' ? DOCS_ALL_GROUP : NAV_GROUPS.find((g) => g.id === id));

interface SidebarProps {
  currentFilter: NavFilter;
  onSelectFilter: (filter: NavFilter) => void;
  /** Number of records the list for a filter shows (already limited to what the user may see) */
  countFor: (filter: NavFilter) => number;
  onOpenUpload: () => void;
  /** Mobile: the sidebar is a drawer */
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentFilter, onSelectFilter, countFor, onOpenUpload, isOpen = false, onClose }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const hasLaborAccess = canAccessLaborContracts(user);
  const [disclosure, setDisclosure] = React.useState<{ filter: NavFilter; section: string | null; group: string | null }>();
  const closeButton = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const opener = document.querySelector<HTMLButtonElement>('.nav-toggle');
    closeButton.current?.focus();
    return () => {
      if (opener?.getClientRects().length) opener.focus();
    };
  }, [isOpen]);

  const handleDrawerKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
    }
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
      .filter((button) => button.getClientRects().length > 0);
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const visible = (group: NavGroup | undefined): group is NavGroup =>
    Boolean(group && (group.when === 'labor' ? hasLaborAccess : group.when === 'admin' ? isAdmin : true));
  const isActive = (item: NavItem) => currentFilter === item.filter || Boolean(item.alsoActive?.includes(currentFilter));
  const entryGroups = (entry: TopEntry) => (entry.groups ?? []).map(groupById).filter(visible);
  const activeEntry = TOP_ENTRIES.find((entry) => entryGroups(entry).some((group) => group.items.some(isActive)));
  const activeFilters = activeEntry && entryGroups(activeEntry).find((group) => group.items.slice(1).some(isActive));
  const expandedSection = disclosure?.filter === currentFilter ? disclosure.section : activeEntry?.id;
  const expandedGroup = disclosure?.filter === currentFilter ? disclosure.group : activeFilters?.id;

  const select = (filter: NavFilter) => {
    onSelectFilter(filter);
    onClose?.();
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    const count = item.noCount ? 0 : countFor(item.filter);
    return (
      <button
        type="button"
        key={item.filter}
        className={`nav-item nav-subitem ${active ? 'active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => select(item.filter)}
      >
        <span className="nav-item-left">
          <item.icon size={14} color={item.color} aria-hidden="true" />
          <span>{t[item.label]}</span>
        </span>
        {count > 0 && <span className="nav-count-badge">{count}</span>}
      </button>
    );
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        id="workspace-navigation"
        className={`sidebar-pane ${isOpen ? 'sidebar-open' : ''}`}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen || undefined}
        aria-label={t.navOpenMenu}
        onKeyDown={handleDrawerKeys}
      >
        {onClose && (
          <button ref={closeButton} type="button" className="btn-icon sidebar-close" onClick={onClose} title={t.close} aria-label={t.close}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
        <nav className="sidebar-nav sidebar-nav-compact" aria-label={t.navOpenMenu}>
          {TOP_ENTRIES.map((entry) => {
            const { filter } = entry;
            if (filter) {
              const here = currentFilter === filter;
              const count = entry.noCount ? 0 : countFor(filter);
              const label = entry.id === 'admin' && !isAdmin ? 'settings' : entry.label;
              return (
                <button
                  type="button"
                  key={entry.id}
                  className={`nav-item nav-top ${here ? 'active' : ''}`}
                  aria-current={here ? 'page' : undefined}
                  onClick={() => select(filter)}
                >
                  <span className="nav-item-left">
                    <entry.icon size={16} aria-hidden="true" />
                    <span>{t[label]}</span>
                  </span>
                  {count > 0 && <span className="nav-count-badge">{count}</span>}
                </button>
              );
            }

            const expanded = expandedSection === entry.id;
            const here = activeEntry?.id === entry.id;
            const panelId = `nav-section-${entry.id}`;
            return (
              <div key={entry.id} className="nav-section">
                <button
                  type="button"
                  className={`nav-item nav-top nav-section-toggle ${here ? 'active-section' : ''}`}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setDisclosure({ filter: currentFilter, section: expanded ? null : entry.id, group: here ? activeFilters?.id ?? null : null })}
                >
                  <span className="nav-item-left">
                    <entry.icon size={16} aria-hidden="true" />
                    <span>{t[entry.label]}</span>
                  </span>
                  <ChevronDown size={14} className="nav-chevron" aria-hidden="true" />
                </button>
                <div className="nav-section-body" id={panelId} hidden={!expanded}>
                  {expanded && entryGroups(entry).map((group) => {
                    const [primary, ...filters] = group.items;
                    if (!filters.length) return renderItem(primary);
                    const filtersOpen = expandedGroup === group.id;
                    const filtersId = `nav-filters-${group.id}`;
                    const filtersLabel = `${t.filter} · ${t[primary.label]}`;
                    return (
                      <div key={group.id}>
                        <div className="nav-filter-row">
                          {renderItem(primary)}
                          <button
                            type="button"
                            className="btn-icon nav-filter-trigger"
                            aria-label={filtersLabel}
                            title={filtersLabel}
                            aria-expanded={filtersOpen}
                            aria-controls={filtersId}
                            onClick={() => setDisclosure({ filter: currentFilter, section: entry.id, group: filtersOpen ? null : group.id })}
                          >
                            <ChevronDown className="nav-chevron" size={14} aria-hidden="true" />
                          </button>
                        </div>
                        <div className="nav-filter-items" id={filtersId} hidden={!filtersOpen}>
                          {filtersOpen && filters.map(renderItem)}
                        </div>
                      </div>
                    );
                  })}
                  {expanded && entry.id === 'documents' && isAdmin && (
                    <button type="button" className="nav-item nav-subitem nav-upload" onClick={() => { onClose?.(); onOpenUpload(); }}>
                      <span className="nav-item-left"><UploadCloud size={15} aria-hidden="true" />{t.quickUploadTitle}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
