import React, { useState, useEffect, useRef, useMemo } from 'react';
import { notify, ToastHost } from './context/ToastContext.tsx';
import { Header, type ViewMode } from './components/Header.tsx';
import { Sidebar, NAV_GROUPS, type NavFilter } from './components/Sidebar.tsx';
import { ItemList, type UnifiedItem } from './components/ItemList.tsx';
import { DetailPane } from './components/DetailPane.tsx';
import { ContractStatsBar } from './components/ContractStatsBar.tsx';
import { ContractTableView } from './components/ContractTableView.tsx';
import { DocumentStatsBar } from './components/DocumentStatsBar.tsx';
import { DocumentTableView } from './components/DocumentTableView.tsx';
import { SpotlightModal } from './components/SpotlightModal.tsx';
import { CreateModal } from './components/CreateModal.tsx';
import { PartnerTableView } from './components/PartnerTableView.tsx';
import { CategorySettingsView, type SettingsSubTab } from './components/CategorySettingsView.tsx';
import { EditRecordModal } from './components/EditRecordModal.tsx';
import { api } from './services/api.ts';
import { parseCurrentLocation, buildRouteUrl, syncUrl } from './services/router.ts';
import { isLaborContract, type DocumentRecord, type ContractRecord, type PartnerRecord } from '../../server/types.ts';
import { X } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LanguageProvider, useLanguage } from './context/LanguageContext.tsx';
import { LoginView } from './components/LoginView.tsx';
import { ChangePasswordView } from './components/ChangePasswordView.tsx';
import { filterItems, filterContracts, findItemByRef } from './utils/itemFilters.ts';
import { useTheme, useSpotlightShortcut, useDocumentTitle } from './hooks/useAppChrome.ts';

const AppContent: React.FC = () => {
  const { t, tf } = useLanguage();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const initialRouteRef = useRef(parseCurrentLocation());
  const { theme, toggleTheme } = useTheme();
  const [currentFilter, setCurrentFilter] = useState<NavFilter>(initialRouteRef.current.currentFilter);
  const [viewMode, setViewMode] = useState<ViewMode>(initialRouteRef.current.viewMode);
  const [settingsSubTab, setSettingsSubTab] = useState<string | null>(initialRouteRef.current.settingsSubTab);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('modal') === 'create' || window.location.hash.includes('modal=create');
    }
    return false;
  });
  const [createModalTab, setCreateModalTab] = useState<'contract' | 'labor' | 'incoming' | 'outgoing'>(() => {
    if (typeof window !== 'undefined') {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'contract' || tabParam === 'labor' || tabParam === 'incoming' || tabParam === 'outgoing') {
        return tabParam;
      }
    }
    return 'contract';
  });
  const [tableSelectedContract, setTableSelectedContract] = useState<ContractRecord | null>(null);
  const [tableSelectedDocument, setTableSelectedDocument] = useState<DocumentRecord | null>(null);
  const [editingItem, setEditingItem] = useState<UnifiedItem | null>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  // Mobile/tablet: the sidebar is an off-canvas drawer
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<UnifiedItem | null>(null);
  const [partnerContractSearch, setPartnerContractSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useSpotlightShortcut(() => setIsSpotlightOpen((prev) => !prev));
  useDocumentTitle(viewMode, selectedItem, tableSelectedContract, tableSelectedDocument);

  const loadData = async (keepSelection = true) => {
    setIsLoading(true);
    try {
      const [docsData, contractsData, statsData, partnersData] = await Promise.all([
        api.getDocuments(),
        api.getContracts(),
        api.getStats(),
        api.getPartners(),
      ]);
      setDocuments(docsData);
      setContracts(contractsData);
      setStats(statsData);
      setPartners(partnersData);

      // Handle Initial Deep-Link Selection from URL
      const targetId = initialRouteRef.current.selectedId;
      const targetKind = initialRouteRef.current.selectedKind;

      if (targetId) {
        const match = findItemByRef(targetId, targetKind, docsData, contractsData);
        if (match) {
          setSelectedItem(match);
          const tableView = initialRouteRef.current.viewMode;
          if (match.kind === 'contract' && tableView === 'contract_table') setTableSelectedContract(match.data);
          if (match.kind === 'document' && tableView === 'doc_table') setTableSelectedDocument(match.data);
        }
        // Consume targetId after first match
        initialRouteRef.current.selectedId = null;
      } else if (!keepSelection || !selectedItem) {
        // Select the first item of the list the user is looking at (e.g. a labor contract on
        // /labor-contracts, not the first document), falling back to anything available
        const { items } = filterItems(initialRouteRef.current.currentFilter, docsData, contractsData, t);
        const fallback: UnifiedItem | null = docsData[0]
          ? { kind: 'document', data: docsData[0] }
          : contractsData[0]
          ? { kind: 'contract', data: contractsData[0] }
          : null;
        const first = items[0] ?? fallback;
        if (first) setSelectedItem(first);
      } else {
        if (selectedItem.kind === 'contract') {
          const fresh = contractsData.find(c => c.id === selectedItem.data.id);
          if (fresh) setSelectedItem({ kind: 'contract', data: fresh });
        } else {
          const fresh = docsData.find(d => d.id === selectedItem.data.id);
          if (fresh) setSelectedItem({ kind: 'document', data: fresh });
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData(false);
    }
  }, [isAuthenticated]);

  // Browser Back/Forward navigation listener (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const route = parseCurrentLocation();
      setViewMode(route.viewMode);
      setCurrentFilter(route.currentFilter);
      if (route.settingsSubTab) {
        setSettingsSubTab(route.settingsSubTab);
      }
      if (route.selectedId) {
        const kind = route.selectedKind === 'contract' ? 'contract' : 'document';
        const match = findItemByRef(route.selectedId, kind, documents, contracts);
        if (match) {
          setSelectedItem(match);
          if (match.kind === 'contract' && route.viewMode === 'contract_table') setTableSelectedContract(match.data);
          if (match.kind === 'document' && route.viewMode === 'doc_table') setTableSelectedDocument(match.data);
        }
      } else {
        if (route.viewMode === 'contract_table') setTableSelectedContract(null);
        if (route.viewMode === 'doc_table') setTableSelectedDocument(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [contracts, documents]);


  const handleSelectItem = (item: UnifiedItem) => {
    setSelectedItem(item);
    const targetUrl = buildRouteUrl({
      viewMode: 'split',
      currentFilter,
      selectedItem: item,
    });
    syncUrl(targetUrl);
  };

  const handleSelectFilter = (filter: NavFilter) => {
    setCurrentFilter(filter);
    let targetView: ViewMode = viewMode;

    if (filter === 'partners_all') {
      targetView = 'partners';
      setViewMode('partners');
    } else if (filter === 'settings_all') {
      targetView = 'settings';
      setViewMode('settings');
    } else if (filter.startsWith('contracts') || filter.startsWith('labor')) {
      setPartnerContractSearch('');
      setTableSelectedContract(null);
      setTableSelectedDocument(null);
      if (viewMode === 'doc_table' || viewMode === 'partners' || viewMode === 'settings') {
        targetView = 'contract_table';
        setViewMode('contract_table');
      }
    } else if (filter.startsWith('docs')) {
      setTableSelectedDocument(null);
      setTableSelectedContract(null);
      if (viewMode === 'contract_table' || viewMode === 'partners' || viewMode === 'settings') {
        targetView = 'doc_table';
        setViewMode('doc_table');
      }
    } else if (filter === 'all') {
      if (viewMode === 'partners' || viewMode === 'settings' || viewMode === 'doc_table' || viewMode === 'contract_table') {
        targetView = 'split';
        setViewMode('split');
      }
    } else if (viewMode === 'partners' || viewMode === 'settings') {
      targetView = 'split';
      setViewMode('split');
    }

    // Auto-select first relevant item in the newly filtered list so the right pane jumps immediately
    const { items: filteredForTarget } = filterItems(filter, documents, contracts, t);
    let targetItem: UnifiedItem | null = filteredForTarget.length > 0 ? filteredForTarget[0] : null;
    setSelectedItem(targetItem);

    const url = buildRouteUrl({
      viewMode: targetView,
      currentFilter: filter,
      selectedItem: targetView === 'split' ? targetItem : null,
      settingsSubTab,
    });
    syncUrl(url);
  };

  const handleToggleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'partners') {
      setCurrentFilter('partners_all');
      syncUrl('/partners');
    } else if (mode === 'settings') {
      setCurrentFilter('settings_all');
      syncUrl(settingsSubTab ? `/settings/${settingsSubTab}` : '/settings');
    } else if (mode === 'doc_table') {
      if (!currentFilter.startsWith('docs')) {
        setCurrentFilter('docs_incoming');
      }
      syncUrl('/documents/table');
    } else if (mode === 'contract_table') {
      if (!currentFilter.startsWith('contracts') && !currentFilter.startsWith('labor')) {
        setCurrentFilter('contracts_all');
      }
      syncUrl(currentFilter.startsWith('labor') ? '/labor-contracts/table' : '/contracts/table');
    } else {
      // Split view
      const nextFilter =
        currentFilter === 'partners_all' || currentFilter === 'settings_all'
          ? 'docs_incoming'
          : currentFilter;
      if (nextFilter !== currentFilter) {
        setCurrentFilter(nextFilter);
      }
      const url = buildRouteUrl({
        viewMode: 'split',
        currentFilter: nextFilter,
        selectedItem,
      });
      syncUrl(url);
    }
  };

  const handleLiquidate = async (id: string) => {
    try {
      const current = contracts.find((c) => c.id === id);
      const updated = await api.liquidateContract(id, current?.revision ?? 0);
      setContracts(prev => prev.map(c => (c.id === id ? updated : c)));
      if (selectedItem?.kind === 'contract' && selectedItem.data.id === id) {
        setSelectedItem({ kind: 'contract', data: updated });
      }
      if (tableSelectedContract?.id === id) {
        setTableSelectedContract(updated);
      }
      const newStats = await api.getStats();
      setStats(newStats);
    } catch (err) {
      notify.error(tf('appLiquidateFailed', { error: String(err) }));
    }
  };

  const handleDelete = async (item: UnifiedItem) => {
    if (!window.confirm(tf('appDeleteConfirm', { title: item.data.title }))) {
      return;
    }

    try {
      if (item.kind === 'contract') {
        await api.deleteContract(item.data.id);
        setContracts(prev => prev.filter(c => c.id !== item.data.id));
        if (tableSelectedContract?.id === item.data.id) {
          setTableSelectedContract(null);
        }
      } else {
        await api.deleteDocument(item.data.id);
        setDocuments(prev => prev.filter(d => d.id !== item.data.id));
        if (tableSelectedDocument?.id === item.data.id) {
          setTableSelectedDocument(null);
        }
      }
      setSelectedItem(null);
      notify.success(t.trashMovedToTrash);
      const newStats = await api.getStats();
      setStats(newStats);
    } catch (err: any) {
      notify.error(tf('appDeleteFailed', { error: err?.message || String(err) }));
    }
  };

  const handleItemUpdated = (updatedItem: UnifiedItem) => {
    if (updatedItem.kind === 'contract') {
      setContracts(prev => prev.map(c => c.id === updatedItem.data.id ? updatedItem.data : c));
      if (selectedItem?.kind === 'contract' && selectedItem.data.id === updatedItem.data.id) {
        setSelectedItem(updatedItem);
      }
      if (tableSelectedContract?.id === updatedItem.data.id) {
        setTableSelectedContract(updatedItem.data);
      }
    } else {
      setDocuments(prev => prev.map(d => d.id === updatedItem.data.id ? updatedItem.data : d));
      if (selectedItem?.kind === 'document' && selectedItem.data.id === updatedItem.data.id) {
        setSelectedItem(updatedItem);
      }
      if (tableSelectedDocument?.id === updatedItem.data.id) {
        setTableSelectedDocument(updatedItem.data);
      }
    }
  };

  const handleSelectItemFromSpotlight = (item: UnifiedItem) => {
    setSelectedItem(item);
    const targetFilter: NavFilter =
      item.kind === 'contract'
        ? isLaborContract(item.data)
          ? 'labor_all'
          : 'contracts_all'
        : item.data.doc_type === 'outgoing'
        ? 'docs_outgoing'
        : 'docs_incoming';
    setCurrentFilter(targetFilter);
    setViewMode('split');
    const url = buildRouteUrl({
      viewMode: 'split',
      currentFilter: targetFilter,
      selectedItem: item,
    });
    syncUrl(url);
  };

  const openCreateWithTab = (tab: 'contract' | 'labor' | 'incoming' | 'outgoing') => {
    setCreateModalTab(tab);
    setIsCreateOpen(true);
  };


  const { title: listTitle, items: listItems } = filterItems(currentFilter, documents, contracts, t);

  // Menu badges come from the same lists the user sees (already limited to what they may read)
  const navCounts = useMemo(() => {
    const counts = new Map<NavFilter, number>();
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        counts.set(item.filter, item.filter === 'partners_all' ? partners.length : filterItems(item.filter, documents, contracts, t).items.length);
      }
    }
    return counts;
  }, [documents, contracts, partners, t]);
  const countFor = (filter: NavFilter) => navCounts.get(filter) ?? 0;

  const isContractSection =
    currentFilter.startsWith('contracts') ||
    currentFilter.startsWith('labor') ||
    (currentFilter === 'all' && selectedItem?.kind === 'contract');

  if (isAuthLoading) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--border-subtle)', borderTopColor: '#107C41', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.appLoadingSystem}</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  // The backend refuses every other call until the initial/temporary password is replaced
  if (user?.must_change_password) {
    return <ChangePasswordView required />;
  }

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        viewMode={viewMode}
        onToggleViewMode={handleToggleViewMode}
        onOpenSpotlight={() => setIsSpotlightOpen(true)}
        onOpenNav={() => setIsNavOpen(true)}
        onOpenCreate={() => {
          if (currentFilter.startsWith('labor') || (user?.role !== 'admin' && user?.can_access_labor_contracts)) {
            openCreateWithTab('labor');
          } else if (currentFilter.startsWith('docs_outgoing')) {
            openCreateWithTab('outgoing');
          } else if (currentFilter.startsWith('docs')) {
            openCreateWithTab('incoming');
          } else {
            openCreateWithTab('contract');
          }
        }}
        onSelectDocumentById={(docId) => {
          const doc = documents.find(d => d.id === docId);
          if (doc) {
            handleSelectItem({ kind: 'document', data: doc });
          } else {
            api.getDocument(docId).then(found => {
              if (found) {
                handleSelectItem({ kind: 'document', data: found });
              }
            });
          }
        }}
      />

      {/* Workspace Body */}
      <div className="main-layout main-workspace">
        {/* Left Sidebar */}
        <Sidebar
          currentFilter={currentFilter}
          onSelectFilter={handleSelectFilter}
          countFor={countFor}
          onOpenUpload={() => openCreateWithTab('incoming')}
          isOpen={isNavOpen}
          onClose={() => setIsNavOpen(false)}
        />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Top Horizontal KPI Stats Bar across the entire workspace width */}
          {viewMode !== 'partners' && viewMode !== 'settings' && currentFilter !== 'partners_all' && currentFilter !== 'settings_all' && (
            isContractSection ? (
              <ContractStatsBar
                stats={stats}
                currentFilter={currentFilter}
                onSelectFilter={handleSelectFilter}
              />
            ) : (
              <DocumentStatsBar
                stats={stats}
                currentFilter={currentFilter}
                onSelectFilter={handleSelectFilter}
              />
            )
          )}

          {/* Main View Modes */}
          {viewMode === 'settings' || currentFilter === 'settings_all' ? (
            /* View Mode: Danh Mục Tham Chiếu & Cấu Hình Hệ Thống */
            <CategorySettingsView
              onRefreshGlobal={() => loadData(true)}
              initialSubTab={settingsSubTab}
              onSubTabChange={(tab: SettingsSubTab) => {
                setSettingsSubTab(tab);
                syncUrl(`/settings/${tab}`);
              }}
            />
          ) : viewMode === 'doc_table' ? (
            /* View Mode: Sổ Công Văn (Excel Table View for Incoming/Outgoing Docs) */
            <DocumentTableView
              documents={documents}
              currentFilter={currentFilter}
              activeTab={
                currentFilter.startsWith('docs_outgoing')
                  ? 'outgoing'
                  : currentFilter === 'docs_internal' || currentFilter === 'docs_decision'
                  ? 'internal'
                  : currentFilter === 'docs_all'
                  ? 'search'
                  : 'incoming'
              }
              onTabChange={tab => {
                if (tab === 'outgoing') setCurrentFilter('docs_outgoing');
                else if (tab === 'incoming') setCurrentFilter('docs_incoming');
                else if (tab === 'internal') setCurrentFilter('docs_internal');
                else setCurrentFilter('docs_all');
              }}
              onSelectDocument={doc => {
                setTableSelectedDocument(doc);
                setSelectedItem({ kind: 'document', data: doc });
                syncUrl(`/documents/${encodeURIComponent(doc.id)}`);
              }}
              onOpenCreate={docType => openCreateWithTab(docType || 'incoming')}
              onDeleteDocument={doc => handleDelete({ kind: 'document', data: doc })}
              onRefreshDocuments={() => loadData(true)}
            />
          ) : viewMode === 'contract_table' ? (
            /* View Mode: Bảng Hợp Đồng (Excel Table View for Contracts) */
            <ContractTableView
              contracts={filterContracts(currentFilter, contracts)}
              onSelectContract={c => {
                setTableSelectedContract(c);
                setSelectedItem({ kind: 'contract', data: c });
                syncUrl(`/contracts/${encodeURIComponent(c.id)}`);
              }}
              onLiquidateContract={handleLiquidate}
              onRefreshContracts={() => loadData(true)}
              initialSearchTerm={partnerContractSearch}
            />
          ) : viewMode === 'partners' || currentFilter === 'partners_all' ? (
            /* View Mode: Danh mục Đối Tác (27 Đối tác) */
            <PartnerTableView
              partners={partners}
              contracts={contracts}
              onSelectPartnerContracts={code => {
                setPartnerContractSearch(code);
                setCurrentFilter('contracts_all');
                setViewMode('contract_table');
                syncUrl('/contracts/table');
              }}
              onSelectContract={c => {
                setTableSelectedContract(c);
                setSelectedItem({ kind: 'contract', data: c });
                setViewMode('contract_table');
                syncUrl(`/contracts/${encodeURIComponent(c.id)}`);
              }}
              onRefreshPartners={() => loadData(true)}
            />
          ) : (
            /* View Mode: Split-View (List Column + Detail Pane). On phones the detail replaces the list. */
            <div className={`split-view ${selectedItem ? 'split-view-has-detail' : ''}`}>
              <div className="split-view-list">
                <ItemList
                  title={listTitle}
                  items={listItems}
                  selectedItem={selectedItem}
                  onSelectItem={handleSelectItem}
                  isLoading={isLoading}
                />
              </div>

              <div className="split-view-detail">
                {selectedItem && (
                  <button type="button" className="btn btn-sm split-view-back" onClick={() => setSelectedItem(null)}>
                    ← {t.backToList}
                  </button>
                )}
                <DetailPane
                  item={selectedItem}
                  onLiquidateContract={handleLiquidate}
                  onDeleteItem={handleDelete}
                  onEditItem={it => setEditingItem(it)}
                  onItemUpdated={handleItemUpdated}
                  onRefresh={() => loadData(true)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slide-over Detail Modal when clicking a Contract in Table View */}
      {viewMode === 'contract_table' && tableSelectedContract && (
        <div
          className="modal-overlay"
          onClick={() => {
            setTableSelectedContract(null);
            syncUrl('/contracts/table');
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 960, maxHeight: '90vh', padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', background: 'var(--bg-surface)' }}>
              <button
                className="btn-icon"
                onClick={() => {
                  setTableSelectedContract(null);
                  syncUrl('/contracts/table');
                }}
                style={{ width: 32, height: 32 }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 56px)' }}>
              <DetailPane
                item={{ kind: 'contract', data: tableSelectedContract }}
                onLiquidateContract={handleLiquidate}
                onDeleteItem={handleDelete}
                onEditItem={it => setEditingItem(it)}
                onItemUpdated={handleItemUpdated}
                onRefresh={() => loadData(true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Detail Modal when clicking a Document in Table View */}
      {viewMode === 'doc_table' && tableSelectedDocument && (
        <div
          className="modal-overlay"
          onClick={() => {
            setTableSelectedDocument(null);
            syncUrl('/documents/table');
          }}
        >
          <div
            className="modal-content"
            style={{ maxWidth: 960, maxHeight: '90vh', padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', background: 'var(--bg-surface)' }}>
              <button
                className="btn-icon"
                onClick={() => {
                  setTableSelectedDocument(null);
                  syncUrl('/documents/table');
                }}
                style={{ width: 32, height: 32 }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 56px)' }}>
              <DetailPane
                item={{ kind: 'document', data: tableSelectedDocument }}
                onLiquidateContract={handleLiquidate}
                onDeleteItem={handleDelete}
                onEditItem={it => setEditingItem(it)}
                onItemUpdated={handleItemUpdated}
                onRefresh={() => loadData(true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Spotlight Search Modal (Cmd+K) */}
      <SpotlightModal
        isOpen={isSpotlightOpen}
        onClose={() => setIsSpotlightOpen(false)}
        onSelectItem={handleSelectItemFromSpotlight}
      />

      {/* Create Document / Contract Modal */}
      <CreateModal
        isOpen={isCreateOpen}
        defaultTab={createModalTab}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => loadData(true)}
      />

      {/* Edit Contract / Document Modal */}
      <EditRecordModal
        isOpen={Boolean(editingItem)}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={() => {
          setEditingItem(null);
          loadData(true);
        }}
      />
    </div>
  );
};

export const App: React.FC = () => (
  <AuthProvider>
    <LanguageProvider>
      <AppContent />
      <ToastHost />
    </LanguageProvider>
  </AuthProvider>
);

export default App;
