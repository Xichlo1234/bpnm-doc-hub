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
    // Page first so a narrow tab still shows what is open; the organisation's full name follows.
    document.title = `${label} · ${t.brandTitle}`;
  }, [viewMode, selectedItem, tableSelectedContract, tableSelectedDocument, t]);

  // Each organisation gets its own monogram on the tab icon (SGII → "SG", BPMN → "BP").
  useEffect(() => {
    setFavicon(tabMonogram(t.tabTitle));
  }, [t.tabTitle]);
}

/** First two letters or digits of the short name, upper-cased; empty when there are none. */
export function tabMonogram(shortName: string): string {
  return (shortName.match(/[\p{L}\p{N}]/gu) ?? []).slice(0, 2).join('').toLocaleUpperCase('vi');
}

/** Kim – Thổ tab icon: a lit gold tile with a dark-earth monogram (or a document mark when empty). */
export function faviconSvg(monogram: string): string {
  const mark = monogram
    ? `<text x="32" y="43" text-anchor="middle" font-family="Inter,'Segoe UI',Arial,sans-serif" font-size="${monogram.length > 1 ? 29 : 36}" font-weight="800" letter-spacing="-1" fill="#3a2606">${monogram.replace(/[<&>"']/g, '')}</text>`
    : '<path d="M24 15h12l8 8v22a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V19a4 4 0 0 1 4-4Z" fill="none" stroke="#3a2606" stroke-width="4" stroke-linejoin="round"/><path d="M36 16v8h8M27 33h11M27 40h8" fill="none" stroke="#3a2606" stroke-width="4" stroke-linecap="round"/>';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<defs>',
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe38a"/><stop offset=".52" stop-color="#fccf4d"/><stop offset="1" stop-color="#e9ad22"/></linearGradient>',
    '<radialGradient id="s" cx=".5" cy="0" r=".75"><stop offset="0" stop-color="#fff6cf" stop-opacity=".95"/><stop offset="1" stop-color="#fff6cf" stop-opacity="0"/></radialGradient>',
    '</defs>',
    '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>',
    '<rect x="2" y="2" width="60" height="60" rx="16" fill="url(#s)"/>',
    '<rect x="3" y="3" width="58" height="58" rx="15" fill="none" stroke="#fff1b3" stroke-width="2"/>',
    mark,
    '</svg>',
  ].join('');
}

function setFavicon(monogram: string) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(monogram))}`;
}
