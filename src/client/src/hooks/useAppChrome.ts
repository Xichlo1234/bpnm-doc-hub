import { useEffect, useState } from 'react';
import type { ViewMode } from '../components/Header.tsx';
import type { UnifiedItem } from '../components/ItemList.tsx';
import type { ContractRecord, DocumentRecord } from '../../../server/types.ts';
import { useLanguage } from '../context/LanguageContext.tsx';

// Window-level concerns of the app shell: theme, global shortcuts and the browser tab title.

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Apply theme to html root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  return { theme, toggleTheme };
}

/** Cmd+K / Ctrl+K toggles the spotlight search. */
export function useSpotlightShortcut(toggle: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export function useDocumentTitle(
  viewMode: ViewMode,
  selectedItem: UnifiedItem | null,
  tableSelectedContract: ContractRecord | null,
  tableSelectedDocument: DocumentRecord | null
) {
  const { t } = useLanguage();

  useEffect(() => {
    if (viewMode === 'home') {
      document.title = `${t.homeNav} | BPNM Doc Hub`;
    } else if (viewMode === 'partners') {
      document.title = `${t.pageTitlePartners} | BPNM Doc Hub`;
    } else if (viewMode === 'settings') {
      document.title = `${t.pageTitleSettings} | BPNM Doc Hub`;
    } else if (viewMode === 'contract_table') {
      document.title = tableSelectedContract
        ? `${tableSelectedContract.contract_number} - ${tableSelectedContract.title} | BPNM Doc Hub`
        : `${t.pageTitleContracts} | BPNM Doc Hub`;
    } else if (viewMode === 'doc_table') {
      document.title = tableSelectedDocument
        ? `${tableSelectedDocument.document_number} - ${tableSelectedDocument.title} | BPNM Doc Hub`
        : `${t.pageTitleDocuments} | BPNM Doc Hub`;
    } else if (selectedItem) {
      if (selectedItem.kind === 'contract') {
        document.title = `${selectedItem.data.contract_number} - ${selectedItem.data.title} | BPNM Doc Hub`;
      } else {
        document.title = `${selectedItem.data.document_number} - ${selectedItem.data.title} | BPNM Doc Hub`;
      }
    } else {
      document.title = `BPNM Doc Hub - ${t.pageTitleHome}`;
    }
  }, [viewMode, selectedItem, tableSelectedContract, tableSelectedDocument, t]);
}
