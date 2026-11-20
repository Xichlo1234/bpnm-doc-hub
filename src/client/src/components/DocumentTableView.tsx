import React, { useState, useMemo, useEffect } from 'react';
import type { DocumentRecord } from '../../../server/types.ts';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  FileSpreadsheet,
  Plus,
  Eye,
  Trash2,
  FileText,
  AlertCircle,
  ExternalLink,
  Upload,
} from 'lucide-react';
import { normalizeVietnamese } from '../utils/text.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { documentDeadlineLabel, statusLabel, urgencyLabel, URGENCY_KEYS } from '../i18n/index.ts';
import { exportToExcel } from '../utils/excelHelper.ts';
import { ExcelManagerModal } from './ExcelManagerModal.tsx';
import { api } from '../services/api.ts';
import { extractYear } from './ContractTableView.tsx';
import type { NavFilter } from './Sidebar.tsx';

interface DocumentTableViewProps {
  documents: DocumentRecord[];
  currentFilter?: NavFilter;
  activeTab?: 'incoming' | 'outgoing' | 'internal' | 'search';
  onTabChange?: (tab: 'incoming' | 'outgoing' | 'internal' | 'search') => void;
  onSelectDocument: (doc: DocumentRecord) => void;
  onOpenCreate: (defaultDocType?: 'incoming' | 'outgoing') => void;
  onDeleteDocument: (doc: DocumentRecord) => void;
  onRefreshDocuments?: () => void;
}

export const DocumentTableView: React.FC<DocumentTableViewProps> = ({
  documents,
  currentFilter,
  activeTab = 'incoming',
  onTabChange,
  onSelectDocument,
  onOpenCreate,
  onDeleteDocument,
  onRefreshDocuments,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isAdmin = user?.role === 'admin';
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [subTab, setSubTab] = useState<'incoming' | 'outgoing' | 'internal' | 'search'>(activeTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterUrgency, setFilterUrgency] = useState('all');
  const [filterYear, setFilterYear] = useState('all');

  // Synchronize internal tab state when activeTab or currentFilter prop changes
  useEffect(() => {
    if (activeTab) {
      setSubTab(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    setFilterStatus('all');
  }, [currentFilter]);

  const handleSwitchTab = (tab: 'incoming' | 'outgoing' | 'internal' | 'search') => {
    setSubTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Extract unique filter options
  const departments = useMemo(() => {
    const set = new Set<string>();
    documents.forEach(d => {
      if (d.department) set.add(d.department);
    });
    return Array.from(set).sort();
  }, [documents]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    documents.forEach(d => {
      if (d.status) set.add(d.status);
    });
    return Array.from(set).sort();
  }, [documents]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    documents.forEach(d => {
      const y = extractYear(d.issue_date) || extractYear(d.received_date) || extractYear(d.document_number);
      if (y) set.add(y);
    });
    return Array.from(set).sort().reverse();
  }, [documents]);

  // Filtered documents strictly separated by document category & sidebar/KPI sub-filter
  const filteredDocs = useMemo(() => {
    return documents.filter(d => {
      // Tab filter: Strictly isolate incoming, outgoing, and internal/decisions
      if (subTab === 'incoming' && d.doc_type !== 'incoming') return false;
      if (subTab === 'outgoing' && d.doc_type !== 'outgoing') return false;
      if (subTab === 'internal' && d.doc_type !== 'internal' && d.doc_type !== 'decision') return false;

      // Apply Left Sidebar / KPI Summary Bar sub-filters
      if (currentFilter === 'docs_incoming_overdue') {
        if (d.doc_type !== 'incoming' || d.deadline_status?.level !== 'overdue') return false;
      } else if (currentFilter === 'docs_incoming_expiring') {
        if (d.doc_type !== 'incoming' || !['urgent', 'warning'].includes(d.deadline_status?.level || '')) return false;
      } else if (currentFilter === 'docs_incoming_processing') {
        if (d.doc_type !== 'incoming' || d.status === 'Hoàn thành' || d.deadline_status?.level === 'overdue') return false;
      } else if (currentFilter === 'docs_incoming_completed') {
        if (d.doc_type !== 'incoming' || (d.status !== 'Hoàn thành' && !d.deadline_status?.level.startsWith('completed'))) return false;
      } else if (currentFilter === 'docs_incoming_unassigned') {
        if (d.doc_type !== 'incoming' || (d.handler && d.handler.trim() !== '')) return false;
      } else if (currentFilter === 'docs_outgoing_sent') {
        if (d.doc_type !== 'outgoing' || d.status === 'Dự thảo') return false;
      } else if (currentFilter === 'docs_outgoing_signing') {
        if (d.doc_type !== 'outgoing' || d.status !== 'Dự thảo') return false;
      }

      // Department filter
      if (filterDepartment !== 'all' && d.department !== filterDepartment) return false;

      // Status filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'overdue' && d.deadline_status?.level !== 'overdue') return false;
        if (filterStatus === 'urgent' && d.deadline_status?.level !== 'urgent') return false;
        if (filterStatus === 'completed' && !d.deadline_status?.level.startsWith('completed')) return false;
        if (filterStatus !== 'overdue' && filterStatus !== 'urgent' && filterStatus !== 'completed' && d.status !== filterStatus) return false;
      }

      // Urgency level filter
      if (filterUrgency !== 'all' && d.urgency_level !== filterUrgency) return false;

      // Year filter
      if (filterYear !== 'all') {
        const year = extractYear(d.issue_date) || extractYear(d.received_date) || extractYear(d.document_number);
        if (year !== filterYear) return false;
      }

      // Search keyword filter
      if (searchTerm.trim()) {
        const qNorm = normalizeVietnamese(searchTerm.trim());
        const matchNum = normalizeVietnamese(d.document_number).includes(qNorm);
        const matchOrig = normalizeVietnamese(d.original_doc_number || '').includes(qNorm);
        const matchTitle = normalizeVietnamese(d.title).includes(qNorm);
        const matchIssuer = normalizeVietnamese(d.issuer || '').includes(qNorm);
        const matchRecipient = normalizeVietnamese(d.recipient || '').includes(qNorm);
        const matchHandler = normalizeVietnamese(d.handler || '').includes(qNorm);
        const matchSigner = normalizeVietnamese(d.signer || '').includes(qNorm);
        const matchDirective = normalizeVietnamese(d.directive || '').includes(qNorm);
        const matchLinked = normalizeVietnamese(d.linked_doc_number || '').includes(qNorm);
        const matchSummary = normalizeVietnamese(d.summary || '').includes(qNorm);
        const matchStorage = normalizeVietnamese(d.storage_location || '').includes(qNorm);
        if (
          !matchNum &&
          !matchOrig &&
          !matchTitle &&
          !matchIssuer &&
          !matchRecipient &&
          !matchHandler &&
          !matchSigner &&
          !matchDirective &&
          !matchLinked &&
          !matchSummary &&
          !matchStorage
        ) {
          return false;
        }
      }

      return true;
    });
  }, [documents, subTab, currentFilter, filterDepartment, filterStatus, filterUrgency, filterYear, searchTerm]);

  // Export to Excel-compatible CSV with UTF-8 BOM
  // i18n-data: exported file columns stay Vietnamese so the file format doesn't depend on the UI language.
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (subTab === 'incoming') {
      headers = [
        'STT',
        'Số đến',
        'Ngày đến',
        'Số / Ký hiệu gốc',
        'Ngày ban hành gốc',
        'Cơ quan gửi',
        'Loại VB',
        'Trích yếu nội dung',
        'Độ khẩn',
        'Độ mật',
        'Bộ phận xử lý',
        'Người xử lý',
        'Hạn xử lý',
        'Ngày hoàn thành',
        'Phúc đáp bằng CV đi số',
        'Trạng thái',
        'Ý kiến chỉ đạo',
        'Nơi lưu bản gốc',
      ];
      rows = filteredDocs.map((d, idx) => [
        String(idx + 1),
        d.document_number,
        d.received_date || '',
        d.original_doc_number || '',
        d.issue_date || '',
        d.issuer || '',
        d.doc_category || d.doc_type,
        `"${(d.title || '').replace(/"/g, '""')}"`,
        d.urgency_level || 'Thường',
        d.security_level || 'Thường',
        d.department || '',
        d.handler || '',
        d.due_date || '',
        d.completed_date || '',
        d.linked_doc_number || '',
        d.deadline_status?.label || d.status || '',
        `"${(d.directive || '').replace(/"/g, '""')}"`,
        d.storage_location || '',
      ]);
    } else if (subTab === 'outgoing') {
      headers = [
        'STT',
        'Số đi',
        'Ngày ban hành',
        'Loại VB',
        'Bộ phận soạn',
        'Người soạn',
        'Người ký',
        'Trích yếu nội dung',
        'Nơi nhận',
        'Độ khẩn',
        'Độ mật',
        'Phúc đáp CV đến số',
        'Hình thức gửi',
        'Trạng thái',
        'Nơi lưu bản gốc',
      ];
      rows = filteredDocs.map((d, idx) => [
        String(idx + 1),
        d.document_number,
        d.issue_date || '',
        d.doc_category || d.doc_type,
        d.department || '',
        d.handler || '',
        d.signer || '',
        `"${(d.title || '').replace(/"/g, '""')}"`,
        d.recipient || d.issuer || '',
        d.urgency_level || 'Thường',
        d.security_level || 'Thường',
        d.linked_doc_number || '',
        d.send_method || '',
        d.deadline_status?.label || d.status || '',
        d.storage_location || '',
      ]);
    } else {
      headers = [
        'STT',
        'Phân loại',
        'Số hiệu VB',
        'Số gốc / Liên kết',
        'Ngày VB',
        'Loại VB',
        'Trích yếu nội dung',
        'Cơ quan gửi / Nơi nhận',
        'Bộ phận',
        'Người phụ trách',
        'Độ khẩn',
        'Trạng thái',
        'Nơi lưu bản gốc',
      ];
      rows = filteredDocs.map((d, idx) => [
        String(idx + 1),
        d.doc_type === 'outgoing' ? 'Đi' : d.doc_type === 'decision' ? 'Quyết định' : d.doc_type === 'internal' ? 'Nội bộ' : 'Đến',
        d.document_number,
        d.original_doc_number || d.linked_doc_number || '',
        d.received_date || d.issue_date || '',
        d.doc_category || d.doc_type,
        `"${(d.title || '').replace(/"/g, '""')}"`,
        d.doc_type === 'outgoing' ? (d.recipient || d.issuer || '') : (d.issuer || ''),
        d.department || '',
        d.doc_type === 'outgoing' ? (d.signer || d.handler || '') : (d.handler || ''),
        d.urgency_level || 'Thường',
        d.deadline_status?.label || d.status || '',
        d.storage_location || '',
      ]);
    }

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `So_Quan_ly_Cong_van_${subTab === 'incoming' ? 'Den' : subTab === 'outgoing' ? 'Di' : subTab === 'internal' ? 'Noi_Bo' : 'Tra_Cuu'}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // i18n-data: exported file columns stay Vietnamese so the file format doesn't depend on the UI language.
  const handleExportExcel = () => {
    exportToExcel(
      filteredDocs,
      [
        { header: 'ID (Không sửa nếu cập nhật)', key: 'id', width: 20 },
        { header: 'Số hiệu văn bản', key: 'document_number', width: 18 },
        { header: 'Số gốc / Ký hiệu', key: 'original_doc_number', width: 18 },
        { header: 'Trích yếu nội dung', key: 'title', width: 35 },
        { header: 'Loại VB', key: 'doc_type', width: 14 },
        { header: 'Phân loại', key: 'doc_category', width: 14 },
        { header: 'Cơ quan ban hành / Gửi', key: 'issuer', width: 25 },
        { header: 'Nơi nhận', key: 'recipient', width: 25 },
        { header: 'Người ký', key: 'signer', width: 18 },
        { header: 'Bộ phận xử lý', key: 'department', width: 16 },
        { header: 'Người xử lý', key: 'handler', width: 18 },
        { header: 'Ngày ban hành', key: 'issue_date', width: 14 },
        { header: 'Ngày đến', key: 'received_date', width: 14 },
        { header: 'Hạn xử lý', key: 'due_date', width: 14 },
        { header: 'Độ khẩn', key: 'urgency_level', width: 12 },
        { header: 'Trạng thái', key: 'status', width: 16 },
        { header: 'Ý kiến chỉ đạo', key: 'directive', width: 30 },
        { header: 'Nơi lưu trữ', key: 'storage_location', width: 20 },
      ],
      `So_Quan_ly_Cong_van_${subTab}_${new Date().toISOString().substring(0, 10)}.xlsx`,
      'Documents'
    );
  };

  const handleBulkImportConfirm = async (parsedData: any[]) => {
    const res = await api.bulkImportDocuments(parsedData);
    return res;
  };

  const getStatusBadge = (d: DocumentRecord) => {
    const ds = d.deadline_status;
    if (!ds) {
      return <span className="status-badge gray">{statusLabel(t, d.status) || t.unassigned}</span>;
    }
    return (
      <span className={`status-badge ${ds.badgeType}`}>
        {ds.level === 'overdue' && <AlertCircle size={12} style={{ marginRight: 3, verticalAlign: -1 }} />}
        {documentDeadlineLabel(t, ds)}
      </span>
    );
  };

  const renderUrgency = (level?: string | null) => {
    if (level === 'Thượng khẩn' || level === 'Hỏa tốc') {
      return <span style={{ color: '#F43F5E', fontWeight: 600 }}>{urgencyLabel(t, level)}</span>;
    }
    if (level === 'Khẩn') {
      return <span style={{ color: '#EA580C', fontWeight: 600 }}>{urgencyLabel(t, level)}</span>;
    }
    return <span style={{ color: 'var(--text-secondary)' }}>{urgencyLabel(t, level) || t.urgencyNormal}</span>;
  };

  const renderDueDate = (doc: DocumentRecord) => {
    if (!doc.due_date) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    const isOverdue = doc.deadline_status?.level === 'overdue';
    return (
      <span style={{ color: isOverdue ? '#F43F5E' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
        {doc.due_date}
      </span>
    );
  };

  const renderLinkedDoc = (linked?: string | null) => {
    if (!linked) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return (
      <span
        className="mono-code"
        style={{ color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: 3 }}
        title={t.linkedDocumentLabel}
      >
        {linked} <ExternalLink size={10} />
      </span>
    );
  };

  const renderDirective = (directive?: string | null) => {
    if (!directive) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    return (
      <span title={directive} style={{ color: '#B45309', fontStyle: 'italic', fontSize: 12 }}>
        "{directive}"
      </span>
    );
  };

  const incomingTotal = useMemo(
    () => documents.filter(d => d.doc_type === 'incoming').length,
    [documents]
  );
  const outgoingTotal = useMemo(
    () => documents.filter(d => d.doc_type === 'outgoing').length,
    [documents]
  );
  const internalTotal = useMemo(
    () => documents.filter(d => d.doc_type === 'internal' || d.doc_type === 'decision').length,
    [documents]
  );

  return (
    <div className="table-view-container">
      {/* Top Toolbar */}
      <div className="table-toolbar">
        {/* Sub-tab pills strictly matching categories */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`btn ${subTab === 'incoming' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => handleSwitchTab('incoming')}
          >
            <ArrowDownLeft size={15} style={{ marginRight: 6 }} />
            {t.tabIncomingDocs} ({incomingTotal})
          </button>
          <button
            className={`btn ${subTab === 'outgoing' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => handleSwitchTab('outgoing')}
          >
            <ArrowUpRight size={15} style={{ marginRight: 6 }} />
            {t.tabOutgoingDocs} ({outgoingTotal})
          </button>
          <button
            className={`btn ${subTab === 'internal' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => handleSwitchTab('internal')}
          >
            <FileText size={15} style={{ marginRight: 6 }} />
            {t.tabInternalDocs} ({internalTotal})
          </button>
          <button
            className={`btn ${subTab === 'search' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => handleSwitchTab('search')}
          >
            <Search size={15} style={{ marginRight: 6 }} />
            {t.tabSearchAll} ({documents.length})
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-outline"
            style={{ fontSize: 13, padding: '7px 12px' }}
            onClick={handleExportExcel}
            title={t.exportDocsTooltip}
          >
            <FileSpreadsheet size={15} style={{ marginRight: 6 }} color="#107C41" />
            {t.exportExcel} ({filteredDocs.length})
          </button>

          {isAdmin && (
            <button
              className="btn btn-outline"
              style={{ fontSize: 13, padding: '7px 12px', background: '#107C41', color: '#ffffff', border: 'none' }}
              onClick={() => setIsExcelModalOpen(true)}
              title={t.importDocsTooltip}
            >
              <Upload size={15} style={{ marginRight: 6 }} />
              {t.importExcel}
            </button>
          )}

          {isAdmin && (
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={() => onOpenCreate(subTab === 'outgoing' ? 'outgoing' : 'incoming')}
            >
              <Plus size={15} style={{ marginRight: 6 }} />
              {subTab === 'outgoing' ? t.createOutgoingBtn : t.createIncomingBtn}
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="table-filter-bar">
        {/* Search Input */}
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
            placeholder={t.searchDocPlaceholder}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Department Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} color="var(--text-muted)" />
          <select
            className="filter-select"
            style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
            value={filterDepartment}
            onChange={e => setFilterDepartment(e.target.value)}
          >
            <option value="all">{t.allDepartments}</option>
            {departments.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <select
          className="filter-select"
          style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="all">{t.allStatusesOption}</option>
          <option value="overdue">{t.overdueStatusOption}</option>
          <option value="urgent">{t.expiringStatusOption}</option>
          <option value="completed">{t.completedStatusOption}</option>
          {statuses.map(s => (
            <option key={s} value={s}>
              {statusLabel(t, s)}
            </option>
          ))}
        </select>

        {/* Urgency Filter */}
        <select
          className="filter-select"
          style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
          value={filterUrgency}
          onChange={e => setFilterUrgency(e.target.value)}
        >
          <option value="all">{t.allUrgencyOption}</option>
          {Object.entries(URGENCY_KEYS).map(([value, key]) => (
            <option key={value} value={value}>
              {t[key]}
            </option>
          ))}
        </select>

        {/* Year Filter */}
        <select
          className="filter-select"
          style={{ height: 34, fontSize: 13, padding: '0 8px', borderRadius: 6 }}
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
        >
          <option value="all">{t.allYearsOption}</option>
          {yearsList.map(y => (
            <option key={y} value={y}>
              {t.yearFormat} {y}
            </option>
          ))}
        </select>

        {searchTerm && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, height: 34, padding: '0 8px' }}
            onClick={() => setSearchTerm('')}
          >
            {t.clearSearchBtn}
          </button>
        )}
      </div>

      {/* Main Excel Spreadsheet Table */}
      <div className="table-scroll-container">
        {subTab === 'incoming' && (
          /* SỔ CÔNG VĂN ĐẾN: Exactly 17 columns in thead and tbody */
          <table className="excel-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>{t.stt}</th>
                <th style={{ width: 125 }}>{t.docIncomingNumberCol}</th>
                <th style={{ width: 95 }}>{t.docIncomingDateCol}</th>
                <th style={{ width: 140 }}>{t.docOriginalNumberCol}</th>
                <th style={{ width: 100 }}>{t.docOriginalDateCol}</th>
                <th style={{ width: 180 }}>{t.docIssuerCol}</th>
                <th style={{ width: 105 }}>{t.docTypeCol}</th>
                <th style={{ minWidth: 260 }}>{t.docTitleCol}</th>
                <th style={{ width: 90 }}>{t.docUrgencyCol}</th>
                <th style={{ width: 135 }}>{t.docHandlerDeptCol}</th>
                <th style={{ width: 125 }}>{t.docHandlerCol}</th>
                <th style={{ width: 95 }}>{t.docDueDateCol}</th>
                <th style={{ width: 140 }}>{t.docStatusCol}</th>
                <th style={{ width: 125 }}>{t.docReplyNumberCol}</th>
                <th style={{ minWidth: 200 }}>{t.docDirectiveCol}</th>
                <th style={{ width: 110 }}>{t.docStorageLocationCol}</th>
                <th style={{ width: 80, textAlign: 'center' }}>{t.actionsHeader}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={17} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <FileText size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <div>{t.noIncomingDocsFound}</div>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc, index) => (
                  <tr
                    key={doc.id}
                    className="table-row-hover"
                    onClick={() => onSelectDocument(doc)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* 1. STT */}
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      {index + 1}
                    </td>

                    {/* 2. Số đến */}
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span className="mono-code" style={{ fontSize: 12 }}>
                        {doc.document_number}
                      </span>
                    </td>

                    {/* 3. Ngày đến */}
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {doc.received_date || '—'}
                    </td>

                    {/* 4. Số / Ký hiệu gốc */}
                    <td style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent-blue)' }}>
                      {doc.original_doc_number || '—'}
                    </td>

                    {/* 5. Ngày VB gốc */}
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {doc.issue_date || '—'}
                    </td>

                    {/* 6. Cơ quan gửi */}
                    <td style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {doc.issuer || '—'}
                    </td>

                    {/* 7. Loại VB */}
                    <td>
                      <span className="type-tag" style={{ fontSize: 11 }}>
                        {doc.doc_category || doc.doc_type}
                      </span>
                    </td>

                    {/* 8. Trích yếu */}
                    <td>
                      <div className="table-title">{doc.title}</div>
                      {doc.file_name && (
                        <span className="table-file-badge">
                          📎 {doc.file_name}
                        </span>
                      )}
                    </td>

                    {/* 9. Độ khẩn */}
                    <td style={{ fontSize: 12 }}>
                      {renderUrgency(doc.urgency_level)}
                    </td>

                    {/* 10. Bộ phận xử lý */}
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {doc.department || '—'}
                    </td>

                    {/* 11. Người xử lý */}
                    <td style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                      {doc.handler || '—'}
                    </td>

                    {/* 12. Hạn xử lý */}
                    <td style={{ fontSize: 12 }}>
                      {renderDueDate(doc)}
                    </td>

                    {/* 13. Tình trạng */}
                    <td>{getStatusBadge(doc)}</td>

                    {/* 14. Phúc đáp số */}
                    <td style={{ fontSize: 12 }}>
                      {renderLinkedDoc(doc.linked_doc_number)}
                    </td>

                    {/* 15. Ý kiến chỉ đạo */}
                    <td style={{ fontSize: 12, maxWidth: 240 }}>
                      {renderDirective(doc.directive)}
                    </td>

                    {/* 16. Lưu bản gốc */}
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {doc.storage_location || '—'}
                    </td>

                    {/* 17. Thao tác */}
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          className="btn-icon"
                          title={t.viewDetailAction}
                          onClick={() => onSelectDocument(doc)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn-icon"
                          title={t.deleteRecordTooltip}
                          onClick={() => onDeleteDocument(doc)}
                        >
                          <Trash2 size={14} color="#BE123C" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {subTab === 'outgoing' && (
          /* SỔ CÔNG VĂN ĐI: Exactly 15 columns in thead and tbody */
          <table className="excel-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>{t.stt}</th>
                <th style={{ width: 150 }}>{t.docOutgoingNumberCol}</th>
                <th style={{ width: 100 }}>{t.docOutgoingDateCol}</th>
                <th style={{ width: 105 }}>{t.docTypeCol}</th>
                <th style={{ width: 140 }}>{t.docDraftingDeptCol}</th>
                <th style={{ width: 125 }}>{t.docDrafterCol}</th>
                <th style={{ width: 125 }}>{t.docSignerCol}</th>
                <th style={{ minWidth: 280 }}>{t.docTitleCol}</th>
                <th style={{ width: 180 }}>{t.docRecipientCol}</th>
                <th style={{ width: 90 }}>{t.docUrgencyCol}</th>
                <th style={{ width: 130 }}>{t.docReplyToIncomingCol}</th>
                <th style={{ width: 120 }}>{t.docSendMethodCol}</th>
                <th style={{ width: 130 }}>{t.docStatusCol}</th>
                <th style={{ width: 110 }}>{t.docStorageLocationCol}</th>
                <th style={{ width: 80, textAlign: 'center' }}>{t.actionsHeader}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <FileText size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <div>{t.noOutgoingDocsFound}</div>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc, index) => (
                  <tr
                    key={doc.id}
                    className="table-row-hover"
                    onClick={() => onSelectDocument(doc)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* 1. STT */}
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      {index + 1}
                    </td>

                    {/* 2. Số đi */}
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      <span className="mono-code" style={{ fontSize: 12 }}>
                        {doc.document_number}
                      </span>
                    </td>

                    {/* 3. Ngày ban hành */}
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {doc.issue_date || '—'}
                    </td>

                    {/* 4. Loại VB */}
                    <td>
                      <span className="type-tag" style={{ fontSize: 11 }}>
                        {doc.doc_category || doc.doc_type}
                      </span>
                    </td>

                    {/* 5. Bộ phận soạn */}
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {doc.department || '—'}
                    </td>

                    {/* 6. Người soạn */}
                    <td style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                      {doc.handler || '—'}
                    </td>

                    {/* 7. Người ký */}
                    <td style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {doc.signer || '—'}
                    </td>

                    {/* 8. Trích yếu nội dung */}
                    <td>
                      <div className="table-title">{doc.title}</div>
                      {doc.file_name && (
                        <span className="table-file-badge">
                          📎 {doc.file_name}
                        </span>
                      )}
                    </td>

                    {/* 9. Nơi nhận */}
                    <td style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {doc.recipient || doc.issuer || '—'}
                    </td>

                    {/* 10. Độ khẩn */}
                    <td style={{ fontSize: 12 }}>
                      {renderUrgency(doc.urgency_level)}
                    </td>

                    {/* 11. Phúc đáp CV đến */}
                    <td style={{ fontSize: 12 }}>
                      {renderLinkedDoc(doc.linked_doc_number)}
                    </td>

                    {/* 12. Hình thức gửi */}
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {doc.send_method || t.defaultSendMethod}
                    </td>

                    {/* 13. Tình trạng */}
                    <td>{getStatusBadge(doc)}</td>

                    {/* 14. Lưu bản gốc */}
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {doc.storage_location || '—'}
                    </td>

                    {/* 15. Thao tác */}
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          className="btn-icon"
                          title={t.viewDetailAction}
                          onClick={() => onSelectDocument(doc)}
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn-icon"
                          title={t.deleteRecordTooltip}
                          onClick={() => onDeleteDocument(doc)}
                        >
                          <Trash2 size={14} color="#BE123C" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {(subTab === 'search' || subTab === 'internal') && (
          /* TRA CỨU TOÀN BỘ HOẶC VB NỘI BỘ & QUYẾT ĐỊNH: Exactly 14 columns in thead and tbody */
          <table className="excel-table">
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>{t.stt}</th>
                <th style={{ width: 95, textAlign: 'center' }}>{t.docClassificationCol}</th>
                <th style={{ width: 140 }}>{t.docNumberCol}</th>
                <th style={{ width: 130 }}>{t.docLinkedNumberCol}</th>
                <th style={{ width: 100 }}>{t.docDateCol}</th>
                <th style={{ width: 105 }}>{t.docTypeCol}</th>
                <th style={{ minWidth: 270 }}>{t.docTitleCol}</th>
                <th style={{ width: 180 }}>{t.docIssuerRecipientCol}</th>
                <th style={{ width: 130 }}>{t.departmentCol}</th>
                <th style={{ width: 130 }}>{t.docInChargeCol}</th>
                <th style={{ width: 90 }}>{t.docUrgencyCol}</th>
                <th style={{ width: 130 }}>{t.docStatusCol}</th>
                <th style={{ width: 110 }}>{t.docStorageLocationCol}</th>
                <th style={{ width: 80, textAlign: 'center' }}>{t.actionsHeader}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                    <FileText size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <div>
                      {subTab === 'internal'
                        ? t.noInternalDocsFound
                        : t.noSearchDocsFound}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc, index) => {
                  const isOutgoing = doc.doc_type === 'outgoing';
                  const isDecision = doc.doc_type === 'decision';
                  const isInternal = doc.doc_type === 'internal';

                  return (
                    <tr
                      key={doc.id}
                      className="table-row-hover"
                      onClick={() => onSelectDocument(doc)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* 1. STT */}
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        {index + 1}
                      </td>

                      {/* 2. Phân loại */}
                      <td style={{ textAlign: 'center' }}>
                        {isOutgoing ? (
                          <span className="status-badge blue" style={{ fontSize: 11 }}>
                            {t.badgeOutgoing}
                          </span>
                        ) : isDecision ? (
                          <span className="status-badge warning" style={{ fontSize: 11 }}>
                            {t.badgeDecision}
                          </span>
                        ) : isInternal ? (
                          <span className="status-badge success" style={{ fontSize: 11 }}>
                            {t.badgeInternal}
                          </span>
                        ) : (
                          <span className="status-badge green" style={{ fontSize: 11 }}>
                            {t.badgeIncoming}
                          </span>
                        )}
                      </td>

                      {/* 3. Số hiệu VB */}
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        <span className="mono-code" style={{ fontSize: 12 }}>
                          {doc.document_number}
                        </span>
                      </td>

                      {/* 4. Số gốc / Liên kết */}
                      <td style={{ fontSize: 12 }}>
                        {doc.original_doc_number || doc.linked_doc_number ? (
                          <span style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>
                            {doc.original_doc_number || doc.linked_doc_number}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      {/* 5. Ngày VB */}
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {doc.received_date || doc.issue_date || '—'}
                      </td>

                      {/* 6. Loại VB */}
                      <td>
                        <span className="type-tag" style={{ fontSize: 11 }}>
                          {doc.doc_category || doc.doc_type}
                        </span>
                      </td>

                      {/* 7. Trích yếu */}
                      <td>
                        <div className="table-title">{doc.title}</div>
                        {doc.file_name && (
                          <span className="table-file-badge">
                            📎 {doc.file_name}
                          </span>
                        )}
                      </td>

                      {/* 8. Cơ quan gửi / Nơi nhận */}
                      <td style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {isOutgoing ? (doc.recipient || doc.issuer || '—') : (doc.issuer || '—')}
                      </td>

                      {/* 9. Bộ phận */}
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {doc.department || '—'}
                      </td>

                      {/* 10. Người phụ trách / Ký */}
                      <td style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                        {isOutgoing ? (doc.signer || doc.handler || '—') : (doc.handler || doc.signer || '—')}
                      </td>

                      {/* 11. Độ khẩn */}
                      <td style={{ fontSize: 12 }}>
                        {renderUrgency(doc.urgency_level)}
                      </td>

                      {/* 12. Tình trạng */}
                      <td>{getStatusBadge(doc)}</td>

                      {/* 13. Lưu bản gốc */}
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {doc.storage_location || '—'}
                      </td>

                      {/* 14. Thao tác */}
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <button
                            className="btn-icon"
                            title={t.viewDetailAction}
                            onClick={() => onSelectDocument(doc)}
                          >
                            <Eye size={14} />
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-icon"
                              title={t.deleteRecordTooltip}
                              onClick={() => onDeleteDocument(doc)}
                            >
                              <Trash2 size={14} color="#BE123C" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Table Footer with Summary */}
      <div className="table-footer-bar">
        <div>
          {t.docFooterDisplaying} <strong>{filteredDocs.length}</strong> / {documents.length} {t.docFooterDocsUnit}
          {filterDepartment !== 'all' && ` · ${t.departmentCol}: ${filterDepartment}`}
          {filterStatus !== 'all' && ` · ${t.docStatusCol}: ${filterStatus}`}
          {filterYear !== 'all' && ` · ${t.yearFormat}: ${filterYear}`}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <span>{t.docFooterClickHint}</span>
          <span>{t.docFooterShortcutHint}</span>
        </div>
      </div>

      {/* Excel Manager Modal for Documents */}
      <ExcelManagerModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        type="document"
        onImportConfirm={handleBulkImportConfirm}
        onSuccess={() => {
          if (onRefreshDocuments) onRefreshDocuments();
        }}
      />
    </div>
  );
};
