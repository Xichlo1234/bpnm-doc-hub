import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateModal } from '../src/client/src/components/CreateModal.tsx';
import { DocumentStatsBar } from '../src/client/src/components/DocumentStatsBar.tsx';
import { DocumentTableView } from '../src/client/src/components/DocumentTableView.tsx';
import { NAV_GROUPS, type NavFilter } from '../src/client/src/components/Sidebar.tsx';
import { documentTypeLabel } from '../src/client/src/i18n/documentTypeLabel.ts';
import { LANGUAGES, translate, translations, type Language, type TranslationKey, type MessageParams } from '../src/client/src/i18n/index.ts';
import { buildRouteUrl, parseCurrentLocation } from '../src/client/src/services/router.ts';
import { filterItems } from '../src/client/src/utils/itemFilters.ts';
import { DOCUMENT_TYPES, type DocumentRecord } from '../src/server/types.ts';

let language: Language = 'vi';
let user = { role: 'admin', can_access_labor_contracts: true };
vi.mock('../src/client/src/context/AuthContext.tsx', () => ({ useAuth: () => ({ user }) }));
vi.mock('../src/client/src/context/LanguageContext.tsx', () => ({
  useLanguage: () => ({
    language,
    t: translations[language],
    tf: (key: TranslationKey, params?: MessageParams) => translate(language, key, params),
  }),
}));

describe('internal document forms and navigation', () => {
  it.each(LANGUAGES)('renders both forms and six localized register buttons in %s', lang => {
    user = { role: 'admin', can_access_labor_contracts: true };
    language = lang;
    const t = translations[lang];
    for (const type of ['internal_incoming', 'internal_outgoing'] as const) {
      const html = renderToStaticMarkup(createElement(CreateModal, { isOpen: true, defaultTab: type, onClose: vi.fn(), onCreated: vi.fn() }));
      const nav = html.match(/<div class="modal-tabs-nav create-tabs">(.*?)<\/div>/s)?.[1] ?? '';
      expect(nav.match(/<button\b/g)).toHaveLength(6);
      for (const label of [t.contractTab, t.laborTabLabel, t.incomingTab, t.outgoingTab, t.internalIncomingTab, t.internalOutgoingTab]) {
        expect(nav).toContain(label);
      }
      expect(nav).toContain(documentTypeLabel(t, type));
      expect(html).toContain(t.internalSenderDepartment);
      expect(html).toContain(t.internalRecipientDepartment);
      expect(html).not.toContain(t.stateAgenciesGroup);
      if (type === 'internal_incoming') {
        expect(html).toContain(t.createInternalIncomingTitle);
        expect(html).toContain('id="internal-incoming-signer"');
        expect(html).toContain(t.deadlineFormLabel);
      } else {
        expect(html).toContain(t.createInternalOutgoingTitle);
        expect(html).toContain('id="internal-outgoing-due"');
        expect(html).toContain('id="internal-outgoing-directive"');
        expect(html).toContain(t.replyToInternalIncoming);
        expect(html).not.toContain(t.sendMethodLabel);
      }
    }
  });

  it('prefills the issue and reception dates with today in Vietnam after local midnight', () => {
    user = { role: 'admin', can_access_labor_contracts: true };
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-27T17:01:00Z'));
      for (const type of ['internal_incoming', 'internal_outgoing'] as const) {
        const html = renderToStaticMarkup(createElement(CreateModal, {
          isOpen: true, defaultTab: type, onClose: vi.fn(), onCreated: vi.fn(),
        }));
        expect(html.match(/value="2026-11-28"/g)).toHaveLength(type === 'internal_incoming' ? 2 : 1);
        expect(html).not.toContain('value="2026-11-27"');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('restricts an internal creation deep link to the registers a user may create in', () => {
    language = 'vi';
    const render = () => renderToStaticMarkup(createElement(CreateModal, {
      isOpen: true, defaultTab: 'internal_incoming', onClose: vi.fn(), onCreated: vi.fn(),
    }));
    user = { role: 'user', can_access_labor_contracts: false };
    expect(render()).toBe('');
    user = { role: 'user', can_access_labor_contracts: true };
    const laborOnly = render();
    const laborHeading = renderToStaticMarkup(createElement('h2', { className: 'modal-title' }, translations.vi.createLaborTitle));
    expect(laborOnly).toContain(laborHeading);
    expect(laborOnly).not.toContain(translations.vi.internalIncomingTab);
    expect(laborOnly).not.toContain(translations.vi.internalOutgoingTab);
  });

  it.each([
    ['/documents/internal', 'docs_internal', ['internalIncomingTab', 'internalOutgoingTab'], [12, 7]],
    ['/documents/internal/incoming', 'docs_internal_incoming', ['internalIncomingTab'], [12]],
    ['/documents/internal/outgoing', 'docs_internal_outgoing', ['internalOutgoingTab'], [7]],
  ] as const)('shows the create actions and counts for %s', (url, filter, labelKeys, counts) => {
    language = 'vi';
    user = { role: 'admin', can_access_labor_contracts: true };
    const { currentFilter, viewMode } = parseCurrentLocation(url);
    expect(viewMode).toBe('doc_table');
    expect(currentFilter).toBe(filter);
    expect(buildRouteUrl({ viewMode, currentFilter })).toBe(url);
    const sidebar = NAV_GROUPS.find(group => group.id === 'internal')!;
    expect(sidebar.items.some(item => item.filter === currentFilter)).toBe(true);

    const table = renderToStaticMarkup(createElement(DocumentTableView, {
      activeTab: 'internal', currentFilter, documents: [],
      onOpenCreate: vi.fn(), onDeleteDocument: vi.fn(), onSelectDocument: vi.fn(),
    }));
    const expectedLabels = labelKeys.map(key => translations.vi[key]);
    const createButtons = [...table.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)]
      .map(match => match[1])
      .filter(content => content.includes('lucide-plus'))
      .map(content => content.replace(/<[^>]+>/g, ''));
    expect(createButtons).toEqual(expectedLabels);

    const stats = renderToStaticMarkup(createElement(DocumentStatsBar, {
      currentFilter, onSelectFilter: vi.fn(), stats: { totalInternalIncoming: 12, totalInternalOutgoing: 7 },
    }));
    expect([...stats.matchAll(/class="stat-card-label">([^<]+)</g)].map(match => match[1])).toEqual(expectedLabels);
    expect([...stats.matchAll(/class="stat-card-value [^"]*">(\d+)</g)].map(match => Number(match[1]))).toEqual(counts);
  });

  it('retains the eight overview cards outside the internal register', () => {
    const stats = renderToStaticMarkup(createElement(DocumentStatsBar, {
      currentFilter: 'docs_incoming', onSelectFilter: vi.fn(), stats: {},
    }));
    expect(stats.match(/class="stat-card-label"/g)).toHaveLength(8);
  });

  it('keeps legacy and directional registers reachable in combined, exact and archived lists', () => {
    const documents = DOCUMENT_TYPES.map(doc_type => ({ doc_type, id: doc_type, status: 'Lưu trữ' }) as DocumentRecord);
    const list = (filter: NavFilter) => filterItems(filter, documents, [], translations.vi).items.map(item => item.data.id);
    expect(list('docs_internal').sort()).toEqual(['decision', 'internal', 'internal_incoming', 'internal_outgoing']);
    expect(list('docs_incoming')).toEqual(['incoming']);
    expect(list('docs_outgoing')).toEqual(['outgoing']);
    expect(list('archive').sort()).toEqual(['incoming', 'internal_incoming', 'internal_outgoing', 'outgoing']);
    const group = NAV_GROUPS.find(g => g.id === 'internal')!;
    for (const direction of ['incoming', 'outgoing'] as const) {
      const filter = `docs_internal_${direction}` as const;
      expect(list(filter)).toEqual([`internal_${direction}`]);
      expect(group.items.find(i => i.filter === filter)).toBeDefined();
      const url = buildRouteUrl({ viewMode: 'split', currentFilter: filter });
      expect(parseCurrentLocation(url).currentFilter).toBe(filter);
    }
  });
});
