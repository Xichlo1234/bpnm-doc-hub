import { describe, it, expect } from 'vitest';
import { NAV_GROUPS, TOP_ENTRIES } from '../src/client/src/components/Sidebar.tsx';

describe('Compact navigation', () => {
  it('keeps every list of the full menu reachable, each from exactly one top-level entry', () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.filter));
    const reachable = TOP_ENTRIES.flatMap((e) => [
      ...(e.filter ? [e.filter] : []),
      ...(e.groups ?? []).flatMap((id) => (id === 'docs_all' ? ['docs_all'] : NAV_GROUPS.find((g) => g.id === id)!.items.map((i) => i.filter))),
    ]);
    expect([...reachable].sort()).toEqual([...all].sort());
    expect(new Set(reachable).size).toBe(reachable.length);
  });

  it('has six top-level entries; only documents and contracts expand', () => {
    expect(TOP_ENTRIES.map((e) => e.id)).toEqual(['overview', 'documents', 'contracts', 'partners', 'archive', 'admin']);
    expect(TOP_ENTRIES.filter((e) => e.groups).map((e) => e.id)).toEqual(['documents', 'contracts']);
  });
});
