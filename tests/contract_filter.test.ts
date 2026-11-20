import { describe, it, expect } from 'vitest';
import type { ContractRecord } from '../src/server/types.ts';
import { extractYear } from '../src/client/src/components/ContractTableView.tsx';

// Test mock contract filter logic to ensure robust multi-criteria matching
function filterContracts(
  contracts: ContractRecord[],
  filters: {
    searchTerm?: string;
    partner?: string;
    contractType?: string;
    department?: string;
    status?: string;
    currency?: string;
    minValue?: number;
    maxValue?: number;
    year?: string;
  }
): ContractRecord[] {
  return contracts.filter(c => {
    if (filters.searchTerm) {
      const q = filters.searchTerm.toLowerCase();
      const match =
        c.contract_number.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.party_b && c.party_b.toLowerCase().includes(q)) ||
        (c.partner_code && c.partner_code.toLowerCase().includes(q));
      if (!match) return false;
    }

    if (filters.partner && filters.partner !== 'all') {
      if (c.party_b !== filters.partner && c.partner_code !== filters.partner) {
        return false;
      }
    }

    if (filters.contractType && filters.contractType !== 'all') {
      if (c.contract_type !== filters.contractType && c.contract_category !== filters.contractType) {
        return false;
      }
    }

    if (filters.department && filters.department !== 'all') {
      if (c.department !== filters.department) return false;
    }

    if (filters.status && filters.status !== 'all') {
      if (c.status !== filters.status) return false;
    }

    if (filters.currency && filters.currency !== 'all') {
      if ((c.currency || 'USD') !== filters.currency) return false;
    }

    if (filters.minValue !== undefined && filters.minValue > 0) {
      if ((c.value || 0) < filters.minValue) return false;
    }

    if (filters.maxValue !== undefined && filters.maxValue > 0) {
      if ((c.value || 0) > filters.maxValue) return false;
    }

    if (filters.year && filters.year !== 'all') {
      const primaryYear = extractYear(c.signed_date) || extractYear(c.start_date) || extractYear(c.contract_number);
      if (primaryYear !== filters.year) return false;
    }

    return true;
  });
}

describe('Contract Multi-Criteria Filter', () => {
  const sampleContracts: ContractRecord[] = [
    {
      id: 'c1',
      contract_number: 'HĐ-2026-001',
      title: 'Hợp đồng mua bán thiết bị khai khoáng',
      contract_type: 'procurement',
      party_a: 'SGII',
      party_b: 'Công ty Cơ khí Tây Bắc',
      department: 'ENG - Ky thuat',
      value: 50000,
      currency: 'USD',
      signed_date: '2026-01-15',
      start_date: '2026-01-15',
      end_date: '2026-12-31',
      status: 'active',
      created_at: '2026-01-15',
      updated_at: '2026-01-15',
    } as any,
    {
      id: 'c2',
      contract_number: 'HĐ-2026-002',
      title: 'Hợp đồng thuê văn phòng đại diện',
      contract_type: 'lease',
      party_a: 'SGII',
      party_b: 'Tòa nhà Landmark',
      department: 'ADM - Hanh chinh',
      value: 120000000,
      currency: 'VND',
      signed_date: '2025-06-01',
      start_date: '2025-06-01',
      end_date: '2026-05-31',
      status: 'active',
      created_at: '2025-06-01',
      updated_at: '2025-06-01',
    } as any,
    {
      id: 'c3',
      contract_number: 'HĐ-2024-099',
      title: 'Hợp đồng tư vấn thiết kế mỏ',
      contract_type: 'service',
      party_a: 'SGII',
      party_b: 'Viện Địa chất Quốc gia',
      department: 'GEO - Dia chat-Tham do',
      value: 15000,
      currency: 'USD',
      signed_date: '2024-03-10',
      start_date: '2024-03-10',
      end_date: '2024-12-31',
      status: 'liquidated',
      created_at: '2024-03-10',
      updated_at: '2024-03-10',
    } as any,
  ];

  it('filters by keyword, currency, and value range', () => {
    const res = filterContracts(sampleContracts, {
      searchTerm: 'thiết bị',
      currency: 'USD',
      minValue: 10000,
    });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('c1');
  });

  it('filters by status and department', () => {
    const res = filterContracts(sampleContracts, {
      department: 'ADM - Hanh chinh',
      status: 'active',
    });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('c2');
  });

  it('filters by year', () => {
    const res2026 = filterContracts(sampleContracts, { year: '2026' });
    expect(res2026.length).toBe(1);
    expect(res2026[0].id).toBe('c1');

    const res2024 = filterContracts(sampleContracts, { year: '2024' });
    expect(res2024.length).toBe(1);
    expect(res2024[0].id).toBe('c3');
  });

  it('filters by year with slash dates and different formats', () => {
    const mixedContracts: ContractRecord[] = [
      {
        id: 'c_slash_1',
        contract_number: 'HĐ-2024-0001',
        signed_date: '6/6/2024',
        start_date: '6/6/2024',
        end_date: '12/31/2026',
        title: 'Hợp đồng A',
        party_b: 'Công ty A',
      } as any,
      {
        id: 'c_slash_2',
        contract_number: 'HĐ-2025-0014',
        signed_date: '10/10/2025',
        start_date: '10/10/2025',
        end_date: '3/10/2026',
        title: 'Hợp đồng B',
        party_b: 'Công ty B',
      } as any,
      {
        id: 'c_iso',
        contract_number: 'HĐ-2026-0099',
        signed_date: '2026-10-25',
        start_date: '2026-10-25',
        end_date: '2027-10-25',
        title: 'Hợp đồng C',
        party_b: 'Công ty C',
      } as any,
    ];

    expect(extractYear('6/6/2024')).toBe('2024');
    expect(extractYear('10/10/2025')).toBe('2025');
    expect(extractYear('2026-10-25')).toBe('2026');
    expect(extractYear('HĐ-2024-0001')).toBe('2024');

    const res2024 = filterContracts(mixedContracts, { year: '2024' });
    expect(res2024.map(c => c.id)).toContain('c_slash_1');

    const res2025 = filterContracts(mixedContracts, { year: '2025' });
    expect(res2025.map(c => c.id)).toContain('c_slash_2');

    const res2026 = filterContracts(mixedContracts, { year: '2026' });
    expect(res2026.map(c => c.id)).toContain('c_iso');
  });

  it('resets correctly when all filters are default', () => {
    const res = filterContracts(sampleContracts, {
      partner: 'all',
      contractType: 'all',
      department: 'all',
      status: 'all',
      currency: 'all',
      year: 'all',
    });
    expect(res.length).toBe(3);
  });
});

