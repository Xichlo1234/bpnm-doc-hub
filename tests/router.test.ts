import { describe, it, expect } from 'vitest';
import { parseCurrentLocation, buildRouteUrl } from '../src/client/src/services/router.ts';

describe('Client Router & URL Management', () => {
  it('should parse root path as default incoming documents', () => {
    const route = parseCurrentLocation('/');
    expect(route.viewMode).toBe('split');
    expect(route.currentFilter).toBe('docs_incoming');
    expect(route.selectedId).toBeNull();
  });

  it('should parse contract routes and sub-filters', () => {
    expect(parseCurrentLocation('/contracts').currentFilter).toBe('contracts_all');
    expect(parseCurrentLocation('/contracts/active').currentFilter).toBe('contracts_active');
    expect(parseCurrentLocation('/contracts/urgent').currentFilter).toBe('contracts_urgent');
    expect(parseCurrentLocation('/contracts/expired').currentFilter).toBe('contracts_expired');
    expect(parseCurrentLocation('/contracts/liquidated').currentFilter).toBe('contracts_liquidated');
    expect(parseCurrentLocation('/contracts/table').viewMode).toBe('contract_table');
  });

  it('should parse specific contract id in URL', () => {
    const route = parseCurrentLocation('/contracts/contract-006');
    expect(route.viewMode).toBe('split');
    expect(route.selectedKind).toBe('contract');
    expect(route.selectedId).toBe('contract-006');
  });

  it('should parse document routes and sub-filters', () => {
    expect(parseCurrentLocation('/documents/incoming').currentFilter).toBe('docs_incoming');
    expect(parseCurrentLocation('/documents/incoming/overdue').currentFilter).toBe('docs_incoming_overdue');
    expect(parseCurrentLocation('/documents/outgoing').currentFilter).toBe('docs_outgoing');
    expect(parseCurrentLocation('/documents/outgoing/sent').currentFilter).toBe('docs_outgoing_sent');
    expect(parseCurrentLocation('/documents/decision').currentFilter).toBe('docs_decision');
    expect(parseCurrentLocation('/documents/table').viewMode).toBe('doc_table');
  });

  it('should parse specific document id in URL', () => {
    const route = parseCurrentLocation('/documents/doc-sample-123');
    expect(route.viewMode).toBe('split');
    expect(route.selectedKind).toBe('document');
    expect(route.selectedId).toBe('doc-sample-123');
  });

  it('should parse partners and settings routes', () => {
    expect(parseCurrentLocation('/partners').viewMode).toBe('partners');
    expect(parseCurrentLocation('/settings').viewMode).toBe('settings');

    const settingsRoute = parseCurrentLocation('/settings/agencies');
    expect(settingsRoute.viewMode).toBe('settings');
    expect(settingsRoute.settingsSubTab).toBe('agencies');
  });

  it('should support hash-based routing as fallback', () => {
    const route = parseCurrentLocation('/#/contracts/contract-030');
    expect(route.selectedKind).toBe('contract');
    expect(route.selectedId).toBe('contract-030');
  });

  it('should build canonical URLs correctly', () => {
    expect(buildRouteUrl({ viewMode: 'partners', currentFilter: 'partners_all' })).toBe('/partners');
    expect(buildRouteUrl({ viewMode: 'settings', currentFilter: 'settings_all', settingsSubTab: 'departments' })).toBe('/settings/departments');
    expect(buildRouteUrl({ viewMode: 'doc_table', currentFilter: 'docs_all' })).toBe('/documents/table');
    expect(buildRouteUrl({ viewMode: 'contract_table', currentFilter: 'contracts_all' })).toBe('/contracts/table');

    expect(buildRouteUrl({
      viewMode: 'split',
      currentFilter: 'contracts_all',
      selectedItem: { kind: 'contract', data: { id: 'contract-006' } as any },
    })).toBe('/contracts/contract-006');

    expect(buildRouteUrl({
      viewMode: 'split',
      currentFilter: 'docs_incoming',
      selectedItem: { kind: 'document', data: { id: 'doc-001' } as any },
    })).toBe('/documents/doc-001');
  });
});
