import { describe, it, expect } from 'vitest';
import { filterItems, filterContracts, findItemByRef } from '../src/client/src/utils/itemFilters.ts';
import { translations, formatMessage } from '../src/client/src/i18n/index.ts';
import type { NavFilter } from '../src/client/src/components/Sidebar.tsx';
import type { UnifiedItem } from '../src/client/src/components/ItemList.tsx';
import { isLaborContract, type ContractRecord, type DocumentRecord } from '../src/server/types.ts';
import { store } from '../src/server/db/store.ts';

// Oracle: the filtering code as it was inside App.tsx before being extracted (verbatim from git),
// so the refactor is checked against the original behaviour for every sidebar filter.
function oracle(documents: DocumentRecord[], contracts: ContractRecord[], currentFilter: NavFilter, t: any) {
  const economicContracts = contracts.filter(c => !isLaborContract(c));
  const laborContracts = contracts.filter(c => isLaborContract(c));
    const getFilteredItems = (filterToUse: NavFilter = currentFilter): { title: string; items: UnifiedItem[] } => {
      switch (filterToUse) {
        case 'all': {
          const unified: UnifiedItem[] = [
            ...documents.map(d => ({ kind: 'document' as const, data: d })),
            ...contracts.map(c => ({ kind: 'contract' as const, data: c })),
          ];
          return { title: t.allDocsAndContracts || t.allContracts, items: unified };
        }
        // Economic Contracts
        case 'contracts_all':
          return {
            title: `${t.allContracts} (${economicContracts.length})`,
            items: economicContracts.map(c => ({ kind: 'contract', data: c })),
          };
        case 'contracts_urgent':
          return {
            title: t.urgentContracts7d,
            items: economicContracts
              .filter(c => c.urgency?.level === 'urgent')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'contracts_warning':
          return {
            title: t.expiringSoon30d,
            items: economicContracts
              .filter(c => c.urgency?.level === 'warning' || c.urgency?.level === 'notice')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'contracts_active':
          return {
            title: t.activeContractsNav,
            items: economicContracts
              .filter(c => c.urgency?.level === 'active')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'contracts_expired':
          return {
            title: t.expiredContractsNav,
            items: economicContracts
              .filter(c => c.urgency?.level === 'expired')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'contracts_liquidated':
          return {
            title: t.liquidatedClosed,
            items: economicContracts
              .filter(c => c.status === 'liquidated')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'contracts_indefinite':
          return {
            title: t.indefiniteNav,
            items: economicContracts
              .filter(c => c.urgency?.level === 'indefinite')
              .map(c => ({ kind: 'contract', data: c })),
          };
  
        // Confidential Labor Contracts
        case 'labor_all':
          return {
            title: formatMessage(t.listTitleLaborAll, { count: laborContracts.length }),
            items: laborContracts.map(c => ({ kind: 'contract', data: c })),
          };
        case 'labor_urgent':
          return {
            title: t.listTitleLaborUrgent,
            items: laborContracts
              .filter(c => c.urgency?.level === 'urgent')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'labor_warning':
          return {
            title: t.listTitleLaborWarning,
            items: laborContracts
              .filter(c => c.urgency?.level === 'warning' || c.urgency?.level === 'notice')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'labor_active':
          return {
            title: t.listTitleLaborActive,
            items: laborContracts
              .filter(c => c.urgency?.level === 'active')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'labor_expired':
          return {
            title: t.listTitleLaborExpired,
            items: laborContracts
              .filter(c => c.urgency?.level === 'expired')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'labor_liquidated':
          return {
            title: t.listTitleLaborLiquidated,
            items: laborContracts
              .filter(c => c.status === 'liquidated')
              .map(c => ({ kind: 'contract', data: c })),
          };
        case 'labor_indefinite':
          return {
            title: t.listTitleLaborIndefinite,
            items: laborContracts
              .filter(c => c.urgency?.level === 'indefinite')
              .map(c => ({ kind: 'contract', data: c })),
          };
  
        // Documents
        case 'docs_all':
          return {
            title: t.listTitleDocsAll,
            items: documents.map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_incoming':
          return {
            title: t.listTitleIncoming,
            items: documents
              .filter(d => d.doc_type === 'incoming')
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_incoming_overdue':
          return {
            title: t.listTitleIncomingOverdue,
            items: documents
              .filter(d => d.doc_type === 'incoming' && d.deadline_status?.level === 'overdue')
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_incoming_expiring':
          return {
            title: t.listTitleIncomingExpiring,
            items: documents
              .filter(d => d.doc_type === 'incoming' && ['urgent', 'warning'].includes(d.deadline_status?.level || ''))
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_incoming_processing':
          return {
            title: t.listTitleIncomingProcessing,
            items: documents
              .filter(d => d.doc_type === 'incoming' && d.status !== 'Hoàn thành' && d.deadline_status?.level !== 'overdue')
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_incoming_completed':
          return {
            title: t.listTitleIncomingCompleted,
            items: documents
              .filter(d => d.doc_type === 'incoming' && (d.status === 'Hoàn thành' || d.deadline_status?.level.startsWith('completed')))
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_incoming_unassigned':
          return {
            title: t.listTitleIncomingUnassigned,
            items: documents
              .filter(d => d.doc_type === 'incoming' && (!d.handler || d.handler.trim() === ''))
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_outgoing':
          return {
            title: t.listTitleOutgoing,
            items: documents
              .filter(d => d.doc_type === 'outgoing')
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_outgoing_sent':
          return {
            title: t.listTitleOutgoingSent,
            items: documents
              .filter(d => d.doc_type === 'outgoing' && d.status !== 'Dự thảo')
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_outgoing_signing':
          return {
            title: t.listTitleOutgoingSigning,
            items: documents
              .filter(d => d.doc_type === 'outgoing' && d.status === 'Dự thảo')
              .map(d => ({ kind: 'document', data: d })),
          };
        case 'docs_decision':
        case 'docs_internal':
          return {
            title: t.listTitleInternalDecisions,
            items: documents
              .filter(d => d.doc_type === 'internal' || d.doc_type === 'decision')
              .map(d => ({ kind: 'document', data: d })),
          };
        default:
          return {
            title: t.listTitleDocuments,
            items: documents.map(d => ({ kind: 'document', data: d })),
          };
      }
    };
    const getFilteredContracts = (currentFilter: NavFilter): ContractRecord[] => {
      switch (currentFilter) {
        case 'contracts_urgent':
          return economicContracts.filter(c => c.urgency?.level === 'urgent');
        case 'contracts_warning':
          return economicContracts.filter(c => c.urgency?.level === 'warning' || c.urgency?.level === 'notice');
        case 'contracts_active':
          return economicContracts.filter(c => c.urgency?.level === 'active');
        case 'contracts_expired':
          return economicContracts.filter(c => c.urgency?.level === 'expired');
        case 'contracts_liquidated':
          return economicContracts.filter(c => c.status === 'liquidated');
        case 'contracts_indefinite':
          return economicContracts.filter(c => c.urgency?.level === 'indefinite');
        case 'labor_all':
          return laborContracts;
        case 'labor_urgent':
          return laborContracts.filter(c => c.urgency?.level === 'urgent');
        case 'labor_warning':
          return laborContracts.filter(c => c.urgency?.level === 'warning' || c.urgency?.level === 'notice');
        case 'labor_active':
          return laborContracts.filter(c => c.urgency?.level === 'active');
        case 'labor_expired':
          return laborContracts.filter(c => c.urgency?.level === 'expired');
        case 'labor_liquidated':
          return laborContracts.filter(c => c.status === 'liquidated');
        case 'labor_indefinite':
          return laborContracts.filter(c => c.urgency?.level === 'indefinite');
        default:
          return economicContracts;
      }
    };
  return { getFilteredItems, getFilteredContracts };
}

const FILTERS: NavFilter[] = ['all', 'contracts_all', 'contracts_urgent', 'contracts_warning', 'contracts_active', 'contracts_expired', 'contracts_liquidated', 'contracts_indefinite', 'labor_all', 'labor_urgent', 'labor_warning', 'labor_active', 'labor_expired', 'labor_liquidated', 'labor_indefinite', 'docs_all', 'docs_incoming', 'docs_incoming_overdue', 'docs_incoming_expiring', 'docs_incoming_processing', 'docs_incoming_completed', 'docs_incoming_unassigned', 'docs_outgoing', 'docs_outgoing_sent', 'docs_outgoing_signing', 'docs_decision', 'docs_internal', 'partners_all', 'settings_all'];

describe('sidebar filters (extracted from App.tsx)', () => {
  store.reset();
  const contracts = store.getContracts();
  const documents = store.getDocuments();
  // Make sure labor contracts and every document type are represented
  contracts[0] = { ...contracts[0], contract_type: 'labor' };
  contracts[1] = { ...contracts[1], contract_type: 'labor', status: 'liquidated' };
  contracts[2] = { ...contracts[2], status: 'liquidated' };

  for (const lang of ['vi', 'en', 'km'] as const) {
    const t = translations[lang];
    const ref = oracle(documents, contracts, 'all', t);
    for (const filter of FILTERS) {
      it(`${lang} / ${filter}`, () => {
        const ids = (items: UnifiedItem[]) => items.map((i) => `${i.kind}:${i.data.id}`);
        const expected = ref.getFilteredItems(filter);
        const actual = filterItems(filter, documents, contracts, t);
        expect(actual.title).toBe(expected.title);
        expect(ids(actual.items)).toEqual(ids(expected.items));
        expect(filterContracts(filter, contracts).map((c) => c.id)).toEqual(ref.getFilteredContracts(filter).map((c) => c.id));
      });
    }
  }
});

describe('list titles per language', () => {
  store.reset();
  const contracts = store.getContracts();
  const documents = store.getDocuments();

  it('keeps the Vietnamese titles and has no Vietnamese in Khmer', () => {
    expect(filterItems('docs_incoming', documents, contracts, translations.vi).title).toBe('Công văn đến (Sổ tiếp nhận)');
    expect(filterItems('labor_urgent', documents, contracts, translations.vi).title).toBe('🔒 HĐ Lao động khẩn cấp (≤ 7 ngày)');
    for (const filter of FILTERS) {
      expect(filterItems(filter, documents, contracts, translations.km).title, filter).not.toMatch(/[ăâđêôơưạảấầậếềệốồộứừựỳỹ]/i);
    }
  });
});

describe('findItemByRef', () => {
  store.reset();
  const contracts = store.getContracts();
  const documents = store.getDocuments();
  const c = contracts[0];
  const d = documents[0];

  it('finds by id or number, honouring the kind', () => {
    expect(findItemByRef(c.contract_number, 'contract', documents, contracts)?.data.id).toBe(c.id);
    expect(findItemByRef(d.document_number, 'document', documents, contracts)?.data.id).toBe(d.id);
    expect(findItemByRef(d.id, 'contract', documents, contracts)).toBeNull();
    expect(findItemByRef(c.id, 'document', documents, contracts)).toBeNull();
  });

  it('tries contracts before documents when the kind is unknown', () => {
    expect(findItemByRef(c.id, null, documents, contracts)?.kind).toBe('contract');
    expect(findItemByRef(d.id, null, documents, contracts)?.kind).toBe('document');
    expect(findItemByRef('missing', null, documents, contracts)).toBeNull();
  });
});
