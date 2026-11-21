import React from 'react';
import {
  Layers,
  FileCheck,
  AlertCircle,
  Clock,
  CheckCircle,
  FileText,
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
  icon?: LucideIcon;
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
    icon: Lock,
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
 * section that holds the current list opens by itself, and the user's choice is remembered.
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
  { id: 'overview', label: 'navTopOverview', icon: Layers, filter: 'all' },
  { id: 'documents', label: 'navTopDocuments', icon: FileText, groups: ['docs_all', 'incoming', 'outgoing', 'internal'] },
  { id: 'contracts', label: 'navTopContracts', icon: FileCheck, groups: ['contracts', 'labor'] },
  { id: 'partners', label: 'navTopPartners', icon: Building2, filter: 'partners_all' },
  { id: 'archive', label: 'navTopArchive', icon: Archive, filter: 'archive' },
  { id: 'admin', label: 'navTopAdmin', icon: SlidersHorizontal, filter: 'settings_all', noCount: true },
];

// "Tất cả văn bản" sits at the top of the documents section
const DOCS_ALL_GROUP: NavGroup = { id: 'docs_all', title: 'navAllDocs', items: [{ filter: 'docs_all', label: 'navAllDocs', icon: FileText }] };
const groupById = (id: string): NavGroup | undefined => (id === 'docs_all' ? DOCS_ALL_GROUP : NAV_GROUPS.find((g) => g.id === id));

const OPEN_KEY = 'bpnm_nav_open';
function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

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
  const [open, setOpen] = React.useState<Record<string, boolean>>(readOpen);

  const visible = (g: NavGroup | undefined): g is NavGroup =>
    Boolean(g) && (g!.when === 'labor' ? hasLaborAccess : g!.when === 'admin' ? isAdmin : true);
  const isActive = (item: NavItem) => currentFilter === item.filter || Boolean(item.alsoActive?.includes(currentFilter));
  const entryGroups = (entry: TopEntry) => (entry.groups ?? []).map(groupById).filter(visible);
  const containsCurrent = (entry: TopEntry) =>
    entry.filter === currentFilter || entryGroups(entry).some((g) => g.items.some(isActive));

  const toggle = (id: string, next: boolean) => {
    setOpen((prev) => {
      const updated = { ...prev, [id]: next };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(updated));
      } catch {
        /* the menu still works without storage */
      }
      return updated;
    });
  };

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
          <item.icon size={14} color={item.color} />
          <span>{t[item.label]}</span>
        </span>
        {count > 0 && <span className="nav-count-badge">{count}</span>}
      </button>
    );
  };

  return (
    <>
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar-pane ${isOpen ? 'sidebar-open' : ''}`} aria-label={t.navOpenMenu}>
        {onClose && (
          <button type="button" className="btn-icon sidebar-close" onClick={onClose} title={t.close}>
            <X size={16} />
          </button>
        )}
        <nav className="sidebar-nav sidebar-nav-compact">
          {TOP_ENTRIES.map((entry) => {
            const here = containsCurrent(entry);
            if (entry.filter) {
              const count = entry.noCount ? 0 : countFor(entry.filter);
              return (
                <button
                  type="button"
                  key={entry.id}
                  className={`nav-item nav-top ${here ? 'active' : ''}`}
                  aria-current={here ? 'page' : undefined}
                  onClick={() => select(entry.filter!)}
                >
                  <span className="nav-item-left">
                    <entry.icon size={16} />
                    <span>{t[entry.label]}</span>
                  </span>
                  {count > 0 && <span className="nav-count-badge">{count}</span>}
                </button>
              );
            }
            const groups = entryGroups(entry);
            if (groups.length === 0) return null;
            // Opens by itself while it holds the current list; otherwise follows the user's choice
            const expanded = open[entry.id] ?? here;
            const panelId = `nav-section-${entry.id}`;
            return (
              <div key={entry.id} className={`nav-section ${expanded ? 'open' : ''}`}>
                <button
                  type="button"
                  className={`nav-item nav-top nav-section-toggle ${here ? 'active-section' : ''}`}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggle(entry.id, !expanded)}
                >
                  <span className="nav-item-left">
                    <entry.icon size={16} />
                    <span>{t[entry.label]}</span>
                  </span>
                  <ChevronDown size={14} className="nav-chevron" aria-hidden="true" />
                </button>
                {expanded && (
                  <div className="nav-section-body" id={panelId}>
                    {groups.map((group) =>
                      group.id === 'docs_all' ? (
                        group.items.map(renderItem)
                      ) : (
                        <div key={group.id} className="nav-subgroup">
                          <div className={`nav-subgroup-title ${group.when === 'labor' ? 'labor' : ''}`}>
                            {group.icon && <group.icon size={11} />}
                            {t[group.title]}
                          </div>
                          {group.items.map(renderItem)}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {isAdmin && (
          <button type="button" className="quick-dropzone" onClick={onOpenUpload}>
            <UploadCloud size={24} color="var(--accent-primary)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t.quickUploadTitle}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.quickUploadDesc}</span>
          </button>
        )}
      </aside>
    </>
  );
};
