import type { NavFilter } from '../components/Sidebar.tsx';
import type { UnifiedItem } from '../components/ItemList.tsx';
import { formatMessage, type TranslationKey, type Translations } from '../i18n/index.ts';
import { isLaborContract, type ContractRecord, type DocumentRecord } from '../../../server/types.ts';

// Sidebar filter → list contents. Pure functions so App.tsx only wires state, and so the filters
// can be unit-tested (tests/item_filters.test.ts).

// Suffix after "contracts_" / "labor_" in a NavFilter
const CONTRACT_PREDICATES: Record<string, (c: ContractRecord) => boolean> = {
  all: () => true,
  urgent: (c) => c.urgency?.level === 'urgent',
  warning: (c) => c.urgency?.level === 'warning' || c.urgency?.level === 'notice',
  active: (c) => c.urgency?.level === 'active',
  expired: (c) => c.urgency?.level === 'expired',
  liquidated: (c) => c.status === 'liquidated',
  indefinite: (c) => c.urgency?.level === 'indefinite',
};

function contractFilterParts(filter: string): { labor: boolean; predicate: (c: ContractRecord) => boolean } | null {
  const match = /^(contracts|labor)_(\w+)$/.exec(filter);
  const predicate = match && CONTRACT_PREDICATES[match[2]];
  return predicate ? { labor: match![1] === 'labor', predicate } : null;
}

/** Contracts shown in the contract table for a filter; economic contracts unless a labor filter is active. */
export function filterContracts(filter: NavFilter, contracts: ContractRecord[]): ContractRecord[] {
  const parts = contractFilterParts(filter);
  const labor = parts?.labor ?? false;
  const predicate = parts?.predicate ?? CONTRACT_PREDICATES.all;
  return contracts.filter((c) => isLaborContract(c) === labor && predicate(c));
}

function contractListTitle(filter: string, t: Translations, economicCount: number, laborCount: number): string {
  const titles: Record<string, string> = {
    contracts_all: `${t.allContracts} (${economicCount})`,
    contracts_urgent: t.urgentContracts7d,
    contracts_warning: t.expiringSoon30d,
    contracts_active: t.activeContractsNav,
    contracts_expired: t.expiredContractsNav,
    contracts_liquidated: t.liquidatedClosed,
    contracts_indefinite: t.indefiniteNav,
    labor_all: formatMessage(t.listTitleLaborAll, { count: laborCount }),
    labor_urgent: t.listTitleLaborUrgent,
    labor_warning: t.listTitleLaborWarning,
    labor_active: t.listTitleLaborActive,
    labor_expired: t.listTitleLaborExpired,
    labor_liquidated: t.listTitleLaborLiquidated,
    labor_indefinite: t.listTitleLaborIndefinite,
  };
  return titles[filter];
}

const isIncoming = (d: DocumentRecord) => d.doc_type === 'incoming';
const isOutgoing = (d: DocumentRecord) => d.doc_type === 'outgoing';

const DOCUMENT_FILTERS: Record<string, { title: TranslationKey; predicate: (d: DocumentRecord) => boolean }> = {
  docs_all: { title: 'listTitleDocsAll', predicate: () => true },
  docs_incoming: { title: 'listTitleIncoming', predicate: isIncoming },
  docs_incoming_overdue: {
    title: 'listTitleIncomingOverdue',
    predicate: (d) => isIncoming(d) && d.deadline_status?.level === 'overdue',
  },
  docs_incoming_expiring: {
    title: 'listTitleIncomingExpiring',
    predicate: (d) => isIncoming(d) && ['urgent', 'warning'].includes(d.deadline_status?.level || ''),
  },
  docs_incoming_processing: {
    title: 'listTitleIncomingProcessing',
    predicate: (d) => isIncoming(d) && d.status !== 'Hoàn thành' && d.deadline_status?.level !== 'overdue',
  },
  docs_incoming_completed: {
    title: 'listTitleIncomingCompleted',
    predicate: (d) => isIncoming(d) && (d.status === 'Hoàn thành' || Boolean(d.deadline_status?.level.startsWith('completed'))),
  },
  docs_incoming_unassigned: {
    title: 'listTitleIncomingUnassigned',
    predicate: (d) => isIncoming(d) && (!d.handler || d.handler.trim() === ''),
  },
  docs_outgoing: { title: 'listTitleOutgoing', predicate: isOutgoing },
  docs_outgoing_sent: {
    title: 'listTitleOutgoingSent',
    predicate: (d) => isOutgoing(d) && d.status !== 'Dự thảo',
  },
  docs_outgoing_signing: {
    title: 'listTitleOutgoingSigning',
    predicate: (d) => isOutgoing(d) && d.status === 'Dự thảo',
  },
  docs_decision: {
    title: 'listTitleInternalDecisions',
    predicate: (d) => d.doc_type === 'internal' || d.doc_type === 'decision',
  },
};
DOCUMENT_FILTERS.docs_internal = DOCUMENT_FILTERS.docs_decision;

const asContractItems = (list: ContractRecord[]): UnifiedItem[] => list.map((c) => ({ kind: 'contract', data: c }));
const asDocumentItems = (list: DocumentRecord[]): UnifiedItem[] => list.map((d) => ({ kind: 'document', data: d }));

/** Title and items of the split-view list for a sidebar filter. */
export function filterItems(
  filter: NavFilter,
  documents: DocumentRecord[],
  contracts: ContractRecord[],
  t: Translations
): { title: string; items: UnifiedItem[] } {
  if (filter === 'all') {
    return {
      title: t.allDocsAndContracts || t.allContracts,
      items: [...asDocumentItems(documents), ...asContractItems(contracts)],
    };
  }

  if (contractFilterParts(filter)) {
    const laborCount = contracts.filter(isLaborContract).length;
    return {
      title: contractListTitle(filter, t, contracts.length - laborCount, laborCount),
      items: asContractItems(filterContracts(filter, contracts)),
    };
  }

  const docFilter = DOCUMENT_FILTERS[filter];
  if (docFilter) {
    return { title: t[docFilter.title], items: asDocumentItems(documents.filter(docFilter.predicate)) };
  }
  return { title: t.listTitleDocuments, items: asDocumentItems(documents) };
}

/**
 * Resolves a deep-link reference (record id, contract number or document number). Without a kind,
 * contracts are tried before documents.
 */
export function findItemByRef(
  ref: string,
  kind: 'contract' | 'document' | null,
  documents: DocumentRecord[],
  contracts: ContractRecord[]
): UnifiedItem | null {
  if (kind !== 'document') {
    const contract = contracts.find((c) => c.id === ref || c.contract_number === ref);
    if (contract) return { kind: 'contract', data: contract };
    if (kind === 'contract') return null;
  }
  const document = documents.find((d) => d.id === ref || d.document_number === ref);
  return document ? { kind: 'document', data: document } : null;
}
