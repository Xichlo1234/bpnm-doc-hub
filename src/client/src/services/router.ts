import type { ViewMode } from '../components/Header.tsx';
import type { NavFilter } from '../components/Sidebar.tsx';
import type { UnifiedItem } from '../components/ItemList.tsx';

export interface RouteState {
  viewMode: ViewMode;
  currentFilter: NavFilter;
  selectedId: string | null;
  selectedKind: 'contract' | 'document' | null;
  settingsSubTab: string | null;
}

export function parseCurrentLocation(customPath?: string, customHash?: string): RouteState {
  let rawPath = customPath;
  if (!rawPath) {
    if (typeof window !== 'undefined') {
      rawPath = window.location.pathname;
      if (!customHash && window.location.hash && window.location.hash.startsWith('#/')) {
        rawPath = window.location.hash.slice(1);
      }
    } else {
      rawPath = '/';
    }
  }
  if (customHash && customHash.startsWith('#/')) {
    rawPath = customHash.slice(1);
  }

  if (rawPath.includes('#/')) {
    rawPath = '/' + rawPath.split('#/')[1];
  } else if (rawPath.startsWith('#')) {
    rawPath = rawPath.slice(1);
  }

  // Remove trailing slashes and normalize
  const normalized = rawPath.replace(/\/+$/, '') || '/';
  const parts = normalized.split('/').filter(Boolean);

  // Default state
  const state: RouteState = {
    viewMode: 'split',
    currentFilter: 'docs_incoming',
    selectedId: null,
    selectedKind: null,
    settingsSubTab: null,
  };

  if (parts.length === 0) {
    return { ...state, viewMode: 'home', currentFilter: 'home' };
  }

  const first = parts[0].toLowerCase();
  const second = parts[1] ? decodeURIComponent(parts[1]) : null;

  if (first === 'guide' || first === 'install') return { ...state, viewMode: first, currentFilter: first };

  // 1. Partners
  if (first === 'partners') {
    state.viewMode = 'partners';
    state.currentFilter = 'partners_all';
    return state;
  }

  // 2. Settings / Categories
  if (first === 'settings' || first === 'categories') {
    state.viewMode = 'settings';
    state.currentFilter = 'settings_all';
    state.settingsSubTab = second || 'doc_types';
    return state;
  }

  // 3. All items
  if (first === 'archive') {
    state.viewMode = 'split';
    state.currentFilter = 'archive';
    return state;
  }

  if (first === 'all') {
    state.viewMode = 'split';
    state.currentFilter = 'all';
    return state;
  }

  // 4. Contracts routes: /contracts, /contracts/table, /contracts/:id, /contracts/:filter
  if (first === 'contracts') {
    if (!second) {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_all';
      return state;
    }

    if (second === 'table') {
      state.viewMode = 'contract_table';
      state.currentFilter = 'contracts_all';
      return state;
    }

    if (second === 'all') {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_all';
      return state;
    }
    if (second === 'active') {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_active';
      return state;
    }
    if (second === 'urgent') {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_urgent';
      return state;
    }
    if (second === 'warning') {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_warning';
      return state;
    }
    if (second === 'expired') {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_expired';
      return state;
    }
    if (second === 'liquidated') {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_liquidated';
      return state;
    }
    if (second === 'indefinite') {
      state.viewMode = 'split';
      state.currentFilter = 'contracts_indefinite';
      return state;
    }

    // Otherwise it is a contract ID: /contracts/contract-006 or /contracts/con-123...
    state.viewMode = 'split';
    state.currentFilter = 'contracts_all';
    state.selectedKind = 'contract';
    state.selectedId = second;
    return state;
  }

  // 4b. Labor Contracts routes: /labor-contracts, /labor-contracts/:filter
  if (first === 'labor-contracts') {
    if (!second || second === 'all') {
      state.viewMode = 'split';
      state.currentFilter = 'labor_all';
      return state;
    }
    if (second === 'table') {
      state.viewMode = 'contract_table';
      state.currentFilter = 'labor_all';
      return state;
    }
    if (second === 'active') {
      state.viewMode = 'split';
      state.currentFilter = 'labor_active';
      return state;
    }
    if (second === 'urgent') {
      state.viewMode = 'split';
      state.currentFilter = 'labor_urgent';
      return state;
    }
    if (second === 'warning') {
      state.viewMode = 'split';
      state.currentFilter = 'labor_warning';
      return state;
    }
    if (second === 'expired') {
      state.viewMode = 'split';
      state.currentFilter = 'labor_expired';
      return state;
    }
    if (second === 'liquidated') {
      state.viewMode = 'split';
      state.currentFilter = 'labor_liquidated';
      return state;
    }
    if (second === 'indefinite') {
      state.viewMode = 'split';
      state.currentFilter = 'labor_indefinite';
      return state;
    }
    state.viewMode = 'split';
    state.currentFilter = 'labor_all';
    state.selectedKind = 'contract';
    state.selectedId = second;
    return state;
  }

  // 5. Documents routes: /documents, /documents/table, /documents/:filter, /documents/:id
  if (first === 'documents') {
    if (!second) {
      state.viewMode = 'split';
      state.currentFilter = 'docs_incoming';
      return state;
    }

    if (second === 'table') {
      state.viewMode = 'doc_table';
      state.currentFilter = 'docs_all';
      return state;
    }

    if (second === 'all') {
      state.viewMode = 'split';
      state.currentFilter = 'docs_all';
      return state;
    }
    if (second === 'incoming') {
      const third = parts[2] ? decodeURIComponent(parts[2]).toLowerCase() : null;
      if (third === 'overdue') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_incoming_overdue';
        return state;
      }
      if (third === 'expiring') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_incoming_expiring';
        return state;
      }
      if (third === 'processing') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_incoming_processing';
        return state;
      }
      if (third === 'completed') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_incoming_completed';
        return state;
      }
      if (third === 'unassigned') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_incoming_unassigned';
        return state;
      }
      state.viewMode = 'split';
      state.currentFilter = 'docs_incoming';
      return state;
    }

    if (second === 'outgoing') {
      const third = parts[2] ? decodeURIComponent(parts[2]).toLowerCase() : null;
      if (third === 'sent') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_outgoing_sent';
        return state;
      }
      if (third === 'draft') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_outgoing_draft';
        return state;
      }
      if (third === 'signing') {
        state.viewMode = 'split';
        state.currentFilter = 'docs_outgoing_signing';
        return state;
      }
      state.viewMode = 'split';
      state.currentFilter = 'docs_outgoing';
      return state;
    }

    if (second === 'decision') {
      state.viewMode = 'split';
      state.currentFilter = 'docs_decision';
      return state;
    }

    if (second === 'internal') {
      state.viewMode = 'doc_table';
      if (parts[2] === 'incoming') state.currentFilter = 'docs_internal_incoming';
      else if (parts[2] === 'outgoing') state.currentFilter = 'docs_internal_outgoing';
      else state.currentFilter = 'docs_internal';
      return state;
    }

    if (second === 'overdue') {
      state.viewMode = 'split';
      state.currentFilter = 'docs_incoming_overdue';
      return state;
    }

    // Otherwise it is a document ID: /documents/doc-001 or /documents/ĐẾN-2026-0001
    state.viewMode = 'split';
    state.currentFilter = 'docs_all';
    state.selectedKind = 'document';
    state.selectedId = second;
    return state;
  }

  return state;
}

export function buildRouteUrl(params: {
  viewMode: ViewMode;
  currentFilter: NavFilter;
  selectedItem?: UnifiedItem | null;
  settingsSubTab?: string | null;
}): string {
  const { viewMode, currentFilter, selectedItem, settingsSubTab } = params;

  if (viewMode === 'home') return '/';
  if (viewMode === 'guide' || viewMode === 'install') return '/' + viewMode;

  if (viewMode === 'partners') {
    return '/partners';
  }

  if (viewMode === 'settings') {
    return settingsSubTab ? `/settings/${settingsSubTab}` : '/settings';
  }

  if (viewMode === 'doc_table' && !currentFilter.startsWith('docs_internal')) {
    return '/documents/table';
  }

  if (viewMode === 'contract_table') {
    return '/contracts/table';
  }

  // Split View with a specifically selected item
  if (viewMode === 'split' && selectedItem) {
    if (selectedItem.kind === 'contract') {
      return `/contracts/${encodeURIComponent(selectedItem.data.id)}`;
    } else {
      return `/documents/${encodeURIComponent(selectedItem.data.id)}`;
    }
  }

  // Split view according to current filter
  switch (currentFilter) {
    case 'all':
      return '/all';
    case 'contracts_all':
      return '/contracts';
    case 'contracts_active':
      return '/contracts/active';
    case 'contracts_urgent':
      return '/contracts/urgent';
    case 'contracts_warning':
      return '/contracts/warning';
    case 'contracts_expired':
      return '/contracts/expired';
    case 'contracts_liquidated':
      return '/contracts/liquidated';
    case 'contracts_indefinite':
      return '/contracts/indefinite';
    case 'labor_all':
      return '/labor-contracts';
    case 'labor_active':
      return '/labor-contracts/active';
    case 'labor_urgent':
      return '/labor-contracts/urgent';
    case 'labor_warning':
      return '/labor-contracts/warning';
    case 'labor_expired':
      return '/labor-contracts/expired';
    case 'labor_liquidated':
      return '/labor-contracts/liquidated';
    case 'labor_indefinite':
      return '/labor-contracts/indefinite';
    case 'docs_all':
      return '/documents/all';
    case 'docs_incoming':
      return '/documents/incoming';
    case 'docs_incoming_overdue':
      return '/documents/incoming/overdue';
    case 'docs_incoming_expiring':
      return '/documents/incoming/expiring';
    case 'docs_incoming_processing':
      return '/documents/incoming/processing';
    case 'docs_incoming_completed':
      return '/documents/incoming/completed';
    case 'docs_incoming_unassigned':
      return '/documents/incoming/unassigned';
    case 'docs_outgoing':
      return '/documents/outgoing';
    case 'docs_outgoing_sent':
      return '/documents/outgoing/sent';
    case 'docs_outgoing_signing':
      return '/documents/outgoing/signing';
    case 'docs_outgoing_draft':
      return '/documents/outgoing/draft';
    case 'archive':
      return '/archive';
    case 'docs_decision':
      return '/documents/decision';
    case 'docs_internal_incoming':
      return '/documents/internal/incoming';
    case 'docs_internal_outgoing':
      return '/documents/internal/outgoing';
    case 'docs_internal':
      return '/documents/internal';
    case 'partners_all':
      return '/partners';
    case 'settings_all':
      return '/settings';
    default:
      return '/documents/incoming';
  }
}

export function syncUrl(url: string, replace = false) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === url) return;
  if (replace) {
    window.history.replaceState({ url }, '', url);
  } else {
    window.history.pushState({ url }, '', url);
  }
}
