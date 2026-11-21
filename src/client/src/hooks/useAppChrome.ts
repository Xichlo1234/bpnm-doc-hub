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
    let label = t.pageTitleHome;
    if (viewMode === 'home') {
      label = t.homeNav;
    } else if (viewMode === 'partners') {
      label = t.pageTitlePartners;
    } else if (viewMode === 'settings') {
      label = t.pageTitleSettings;
    } else if (viewMode === 'contract_table') {
      label = tableSelectedContract ? `${tableSelectedContract.contract_number} - ${tableSelectedContract.title}` : t.pageTitleContracts;
    } else if (viewMode === 'doc_table') {
      label = tableSelectedDocument ? `${tableSelectedDocument.document_number} - ${tableSelectedDocument.title}` : t.pageTitleDocuments;
    } else if (selectedItem) {
      const number = selectedItem.kind === 'contract' ? selectedItem.data.contract_number : selectedItem.data.document_number;
      label = `${number} - ${selectedItem.data.title}`;
    }
    document.title = `BPMN | ${label}`;
  }, [viewMode, selectedItem, tableSelectedContract, tableSelectedDocument, t]);
}
