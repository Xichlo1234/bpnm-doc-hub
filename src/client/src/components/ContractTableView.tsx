import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Download,
  Upload,
  CheckCircle,
  Eye,
  Search,
  FileText,
  ArrowUpDown,
  FileSpreadsheet,
  Filter,
  RotateCcw,
} from 'lucide-react';
import type { ContractRecord } from '../../../server/types.ts';
import { UrgencyBadge } from './UrgencyBadge.tsx';
import { api, type ImportCommitOptions } from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { ExcelManagerModal } from './ExcelManagerModal.tsx';
import { formatCurrencyValue, getCurrencySymbol } from '../utils/currency.ts';
import { seedLabel } from '../i18n/index.ts';
import { exportToExcel } from '../utils/excelHelper.ts';

// Extract 4-digit year from any date format (YYYY-MM-DD, M/D/YYYY, DD/MM/YYYY, YYYY...)
export function extractYear(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  // 1. Matches 4-digit year starting with 19xx or 20xx
  const match = str.match(/\b(19\d{2}|20\d{2})\b/);
  if (match) return match[1];

  // 2. If slash or dash separated, check the last part if 4 digits
  const parts = str.split(/[-/]/);
  for (const part of parts) {
    const p = part.trim();
    if (/^\d{4}$/.test(p)) return p;
  }
  return null;
}

interface ContractTableViewProps {
  contracts: ContractRecord[];
  onSelectContract: (contract: ContractRecord) => void;
  onLiquidateContract: (id: string) => Promise<void>;
  onRefreshContracts?: () => void;
  initialSearchTerm?: string;
}

export const ContractTableView: React.FC<ContractTableViewProps> = ({
  contracts,
  onSelectContract,
  onLiquidateContract,
  onRefreshContracts,
  initialSearchTerm = '',
}) => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const isAdmin = user?.role === 'admin';

  // Filters State
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [filterPartner, setFilterPartner] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCurrency, setFilterCurrency] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [sortField, setSortField] = useState<'contract_number' | 'end_date' | 'value'>('end_date');
  const [sortAsc, setSortAsc] = useState(true);

  // Excel Modal State
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

  useEffect(() => {
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  // Extract unique options
  const partnersList = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach(c => {
      if (c.party_b) set.add(c.party_b.trim());
    });
    return Array.from(set).sort();
  }, [contracts]);

  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach(c => {
      if (c.department) set.add(c.department.trim());
    });
    return Array.from(set).sort();
  }, [contracts]);

  const contractTypesList = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach(c => {
      if (c.contract_category) set.add(c.contract_category.trim());
      else if (c.contract_type) set.add(c.contract_type.trim());
    });
    return Array.from(set).sort();
  }, [contracts]);

  const currenciesList = useMemo(() => {
    const set = new Set<string>(['USD', 'KHR', 'VND']);
    contracts.forEach(c => {
      if (c.currency) set.add(c.currency.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [contracts]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach(c => {
      const y = extractYear(c.signed_date) || extractYear(c.start_date) || extractYear(c.contract_number);
      if (y) set.add(y);
    });
    return Array.from(set).sort().reverse();
  }, [contracts]);

  // Reset Filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterPartner('all');
    setFilterType('all');
    setFilterDept('all');
    setFilterStatus('all');
    setFilterCurrency('all');
    setFilterYear('all');
  };

  const hasActiveFilters =
    Boolean(searchTerm) ||
    filterPartner !== 'all' ||
    filterType !== 'all' ||
    filterDept !== 'all' ||
    filterStatus !== 'all' ||
    filterCurrency !== 'all' ||
    filterYear !== 'all';

  // Multi-criteria Filtering
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      // Keyword search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          c.contract_number.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.title_en && c.title_en.toLowerCase().includes(q)) ||
          c.party_b.toLowerCase().includes(q) ||
          (c.partner_code && c.partner_code.toLowerCase().includes(q)) ||
          (c.partner_contact && c.partner_contact.toLowerCase().includes(q)) ||
          (c.notes && c.notes.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Partner filter
      if (filterPartner !== 'all' && c.party_b.trim() !== filterPartner) {
        return false;
      }

      // Contract Type filter
      if (filterType !== 'all') {
        if (c.contract_category !== filterType && c.contract_type !== filterType) {
          return false;
        }
      }

      // Department filter
      if (filterDept !== 'all' && c.department?.trim() !== filterDept) {
        return false;
      }

      // Status filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'active' && c.urgency?.level !== 'active') return false;
        if (filterStatus === 'indefinite' && c.urgency?.level !== 'indefinite') return false;
        if (filterStatus === 'liquidated' && c.status !== 'liquidated') return false;
        if (filterStatus === 'expired' && c.urgency?.level !== 'expired') return false;
        if (filterStatus === 'urgent' && c.urgency?.level !== 'urgent' && c.urgency?.level !== 'warning' && c.urgency?.level !== 'notice') return false;
      }

      // Currency filter
      if (filterCurrency !== 'all') {
        if ((c.currency || 'USD').toUpperCase() !== filterCurrency) return false;
      }

      // Year filter: Filter primarily by signed_date or start_date; if neither, fallback to contract_number
      if (filterYear !== 'all') {
        const primaryYear = extractYear(c.signed_date) || extractYear(c.start_date) || extractYear(c.contract_number);
        if (primaryYear !== filterYear) return false;
      }

      return true;
    });
  }, [contracts, searchTerm, filterPartner, filterType, filterDept, filterStatus, filterCurrency, filterYear]);

  // Sorting
  const sortedContracts = useMemo(() => {
    return [...filteredContracts].sort((a, b) => {
      if (sortField === 'value') {
        return sortAsc ? (a.value || 0) - (b.value || 0) : (b.value || 0) - (a.value || 0);
      }
      if (sortField === 'contract_number') {
        return sortAsc
          ? a.contract_number.localeCompare(b.contract_number)
          : b.contract_number.localeCompare(a.contract_number);
      }
      const dateA = a.end_date || '9999-12-31';
      const dateB = b.end_date || '9999-12-31';
      return sortAsc ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });
  }, [filteredContracts, sortField, sortAsc]);

  const toggleSort = (field: 'contract_number' | 'end_date' | 'value') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    // i18n-data: exported file columns stay Vietnamese so the file format doesn't depend on the UI language.
    exportToExcel(
      sortedContracts,
      [
        { header: 'ID', key: 'id', width: 18 },
        { header: 'Số hợp đồng', key: 'contract_number', width: 20 },
        { header: 'Tên / Nội dung hợp đồng', key: 'title', width: 35 },
        { header: 'Tên tiếng Anh', key: 'title_en', width: 28 },
        { header: 'Loại HĐ', key: 'contract_category', width: 20 },
        { header: 'Bên A', key: 'party_a', width: 32 },
        { header: 'Bên B (Đối tác)', key: 'party_b', width: 32 },
        { header: 'Mã đối tác', key: 'partner_code', width: 14 },
        { header: 'Bộ phận', key: 'department', width: 16 },
        { header: 'Giá trị', key: 'value', width: 16 },
        { header: 'Loại tiền', key: 'currency', width: 12 },
        { header: 'Ngày ký', key: 'signed_date', width: 14 },
        { header: 'Ngày hiệu lực', key: 'start_date', width: 14 },
        { header: 'Ngày hết hạn', key: 'end_date', width: 14 },
        { header: 'Trạng thái', key: 'status', width: 14 },
        { header: 'Nơi lưu trữ', key: 'storage_location', width: 20 },
        { header: 'Ghi chú', key: 'notes', width: 25 },
      ],
      `Danh_Sach_Hop_Dong_SGII_${new Date().toISOString().substring(0, 10)}.xlsx`,
      'Contracts'
    );
  };

  const handleBulkImportConfirm = async (parsedData: any[], options?: ImportCommitOptions) => {
    const res = await api.bulkImportContracts(parsedData, options);
    return res;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', overflow: 'hidden' }}>
      {/* Top Toolbar */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          background: 'var(--bg-surface-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {t.contractTable}
          </h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ({sortedContracts.length} {t.recordsFound})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Export Excel (Available to all logged in users) */}
          <button
            onClick={handleExportExcel}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            title={t.exportContractsTooltip}
          >
            <FileSpreadsheet size={15} color="#107C41" />
            <span>{t.exportExcel} ({sortedContracts.length})</span>
          </button>

          {/* Import Excel (Admin Only) */}
          {isAdmin && (
            <button
              onClick={() => setIsExcelModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 34,
                padding: '0 14px',
                borderRadius: 'var(--radius-md)',
                background: '#107C41',
                border: 'none',
                color: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
              title={t.importExcelTooltip}
            >
              <Upload size={15} />
              <span>{t.importExcel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filter Bar (Identical styling to DocumentTableView) */}
      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Keyword Search */}
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search
            size={14}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            className="search-input"
            style={{ width: '100%', paddingLeft: 32, fontSize: 13, height: 34 }}
            placeholder={t.searchContractPlaceholder}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Partner Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            className="filter-select"
            style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
            value={filterPartner}
            onChange={e => setFilterPartner(e.target.value)}
          >
            <option value="all">{t.allPartners}</option>
            {partnersList.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Contract Type Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            className="filter-select"
            style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="all">{t.allContractTypes}</option>
            {contractTypesList.map(ct => (
              <option key={ct} value={ct}>{seedLabel(language, ct)}</option>
            ))}
          </select>
        </div>

        {/* Department Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            className="filter-select"
            style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
          >
            <option value="all">{t.allDepartments}</option>
            {departmentsList.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            className="filter-select"
            style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">{t.allStatuses}</option>
            <option value="active">{t.activeContractsNav}</option>
            <option value="urgent">{t.urgentContracts7d}</option>
            <option value="expired">{t.expiredContractsNav}</option>
            <option value="liquidated">{t.liquidatedClosed}</option>
            <option value="indefinite">{t.indefiniteNav}</option>
          </select>
        </div>

        {/* Currency Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            className="filter-select"
            style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
            value={filterCurrency}
            onChange={e => setFilterCurrency(e.target.value)}
          >
            <option value="all">{t.allCurrencies}</option>
            {currenciesList.map(curr => (
              <option key={curr} value={curr}>{curr}</option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            className="filter-select"
            style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
          >
            <option value="all">{t.allYears}</option>
            {yearsList.map(y => (
              <option key={y} value={y}>{t.yearFormat} {y}</option>
            ))}
          </select>
        </div>

        {/* Reset Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              height: 34,
              padding: '0 10px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
            }}
            title={t.resetFilter}
          >
            <RotateCcw size={13} />
            <span>{t.resetFilter}</span>
          </button>
        )}
      </div>

      {/* Responsive Data Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                background: 'var(--bg-surface-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                position: 'sticky',
                top: 0,
                zIndex: 10,
              }}
            >
              <th style={{ padding: '10px 14px', width: 45, color: 'var(--text-muted)', fontWeight: 700 }}>{t.stt}</th>
              <th
                style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => toggleSort('contract_number')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t.contractNumber} <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700, minWidth: 220 }}>
                {t.contractTitleCol}
              </th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700, minWidth: 160 }}>
                {t.partnerBCol}
              </th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.departmentCol}</th>
              <th
                style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => toggleSort('value')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t.valueCol} <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.signedDateCol}</th>
              <th
                style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => toggleSort('end_date')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t.endDateCol} <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.urgencyStatusCol}</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center' }}>
                {t.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedContracts.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t.noDataFound}
                </td>
              </tr>
            ) : (
              sortedContracts.map((c, idx) => {
                const isLiquidated = c.status === 'liquidated';
                const curr = c.currency || 'USD';
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.1s ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => onSelectContract(c)}
                  >
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                      {c.contract_number}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.file_name && <FileText size={14} color="#d45364" style={{ flexShrink: 0 }} />}
                        <span>{c.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      {c.party_b}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                      {c.department || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatCurrencyValue(c.value, curr)} {getCurrencySymbol(curr)}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      {c.signed_date}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      {c.end_date || t.indefiniteTerm}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <UrgencyBadge urgency={c.urgency} />
                    </td>
                    <td
                      style={{ padding: '12px 14px', textAlign: 'center' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <button
                          className="btn-icon"
                          style={{ width: 28, height: 28 }}
                          onClick={() => onSelectContract(c)}
                          title={t.viewDetailAction}
                        >
                          <Eye size={13} />
                        </button>

                        {/* Liquidate action (Admin Only) */}
                        {isAdmin && !isLiquidated && (
                          <button
                            className="btn-icon"
                            style={{ width: 28, height: 28 }}
                            onClick={() => onLiquidateContract(c.id)}
                            title={t.liquidateAction}
                          >
                            <CheckCircle size={13} color="var(--success-dot)" />
                          </button>
                        )}

                        {c.file_name && (
                          <a
                            href={c.file_key?.startsWith('samples/') ? `/${c.file_key}` : `/api/files/${c.file_key || c.file_name}`}
                            download={c.file_name}
                            className="btn-icon"
                            style={{ width: 28, height: 28, textDecoration: 'none' }}
                            title={t.downloadAttachment}
                          >
                            <Download size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Excel Manager Modal */}
      <ExcelManagerModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        type="contract"
        onImportConfirm={handleBulkImportConfirm}
        onSuccess={() => {
          if (onRefreshContracts) onRefreshContracts();
        }}
      />
    </div>
  );
};
