import React, { useState, useMemo } from 'react';
import type { PartnerRecord, ContractRecord } from '../../../server/types.ts';
import { Search, Download, Building2, ArrowRight, Lock, Unlock, Plus, Pencil, Trash2, X, FileText, ExternalLink, Calendar, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api.ts';
import { PartnerModal } from './PartnerModal.tsx';
import { UrgencyBadge } from './UrgencyBadge.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { seedLabel } from '../i18n/index.ts';
import { formatCurrencyValue, getCurrencySymbol } from '../utils/currency.ts';

interface PartnerTableViewProps {
  partners: PartnerRecord[];
  contracts: ContractRecord[];
  onSelectPartnerContracts?: (partnerCode: string) => void;
  onRefreshPartners?: () => void;
  onSelectContract?: (contract: ContractRecord) => void;
}

export const PartnerTableView: React.FC<PartnerTableViewProps> = ({
  partners,
  contracts,
  onSelectPartnerContracts,
  onRefreshPartners,
  onSelectContract,
}) => {
  const { language, t, tf } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerRecord | null>(null);
  const [viewingContractsPartner, setViewingContractsPartner] = useState<PartnerRecord | null>(null);

  const handleOpenAdd = () => {
    setEditingPartner(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: PartnerRecord) => {
    setEditingPartner(p);
    setIsModalOpen(true);
  };

  const handleToggleLock = async (p: PartnerRecord) => {
    try {
      await api.togglePartnerLock(p.id);
      onRefreshPartners?.();
    } catch (err) {
      alert(tf('partnerToggleLockFailed', { error: String(err) }));
    }
  };

  const handleDelete = async (p: PartnerRecord) => {
    if (confirm(tf('partnerDeleteConfirm', { code: p.code, name: p.name_vn }))) {
      try {
        await api.deletePartner(p.id);
        onRefreshPartners?.();
      } catch (err) {
        alert(tf('partnerDeleteFailed', { error: String(err) }));
      }
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    partners.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [partners]);

  const filteredPartners = useMemo(() => {
    return partners.filter(p => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchCode = (p.code || '').toLowerCase().includes(q);
      const matchNameVn = (p.name_vn || '').toLowerCase().includes(q);
      const matchNameEn = (p.name_en || '').toLowerCase().includes(q);
      const matchTax = (p.tax_id || '').toLowerCase().includes(q);
      const matchContact = (p.contact_person || p.contact || '').toLowerCase().includes(q);
      const matchRep = (p.representative || '').toLowerCase().includes(q);

      return matchCode || matchNameVn || matchNameEn || matchTax || matchContact || matchRep;
    });
  }, [partners, searchQuery, categoryFilter]);

  // Export to CSV with UTF-8 BOM
  const handleExportCSV = () => {
    // i18n-data: exported file columns stay Vietnamese so the file format doesn't depend on the UI language.
    const headers = [
      'STT',
      'Mã đối tác (Client ID)',
      'Tên đối tác (VN)',
      'Tên đối tác (EN)',
      'Phân loại',
      'Mã số thuế',
      'Người đại diện',
      'Đầu mối liên hệ',
      'Địa chỉ',
      'Số hợp đồng',
      'Đang còn hiệu lực',
      'Ghi chú',
    ];

    const rows = filteredPartners.map((p, idx) => [
      idx + 1,
      `"${(p.code || '').replace(/"/g, '""')}"`,
      `"${(p.name_vn || '').replace(/"/g, '""')}"`,
      `"${(p.name_en || '').replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      `"${(p.tax_id || '').replace(/"/g, '""')}"`,
      `"${(p.representative || '').replace(/"/g, '""')}"`,
      `"${(p.contact_person || p.contact || '').replace(/"/g, '""')}"`,
      `"${(p.address || '').replace(/"/g, '""')}"`,
      p.contract_count ?? p.total_contracts ?? 0,
      p.active_contract_count ?? p.active_contracts ?? 0,
      `"${(p.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Danh_sach_Doi_tac_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-page)' }}>
      {/* Control Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={20} color="var(--accent-primary)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {t.partnerListTitle}
            </h2>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
              }}
            >
              {filteredPartners.length} / {partners.length} {t.partnerCountSummary}
            </span>
          </div>

          <div
            style={{
              position: 'relative',
              maxWidth: 320,
              width: '100%',
            }}
          >
            <Search
              size={14}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder={t.searchPartnerPlaceholder}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: 34,
                padding: '0 12px 0 32px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              style={{
                height: 34,
                padding: '0 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <option value="all">{t.allCategories}</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleOpenAdd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-primary)',
              border: 'none',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
            title={t.addPartnerBtn}
          >
            <Plus size={15} />
            <span>{t.addPartnerBtn}</span>
          </button>

          <button
            onClick={handleExportCSV}
            style={{
              display: 'flex',
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
            title={t.exportCsvBtn}
          >
            <Download size={14} />
            <span>{t.exportCsvBtn}</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '10px 12px', width: 45, fontWeight: 600, color: 'var(--text-muted)' }}>{t.stt}</th>
                <th style={{ padding: '10px 12px', width: 110, fontWeight: 600, color: 'var(--text-muted)' }}>{t.partnerCodeHeader}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', minWidth: 240 }}>{t.partnerNameHeader}</th>
                <th style={{ padding: '10px 12px', width: 130, fontWeight: 600, color: 'var(--text-muted)' }}>{t.categoryColHeader}</th>
                <th style={{ padding: '10px 12px', width: 130, fontWeight: 600, color: 'var(--text-muted)' }}>{t.taxIdHeader}</th>
                <th style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-muted)', minWidth: 180 }}>{t.contactPersonHeader}</th>
                <th style={{ padding: '10px 12px', width: 100, textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>{t.contractCountHeader}</th>
                <th style={{ padding: '10px 12px', width: 110, textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>{t.validityHeader}</th>
                <th style={{ padding: '10px 12px', width: 145, textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>{t.actionsHeader}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPartners.map((p, idx) => {
                const partnerContracts = contracts.filter(
                  c => c.partner_code === p.code || (p.code && c.contract_number.includes(p.code))
                );
                const contractCount = p.contract_count ?? partnerContracts.length;
                const activeCount = p.active_contract_count ?? partnerContracts.filter(c => c.urgency?.level === 'active').length;

                return (
                  <tr
                    key={p.id || p.code || idx}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.15s ease',
                      opacity: p.is_locked ? 0.7 : 1,
                      cursor: 'pointer',
                    }}
                    className="table-row-hover"
                    onClick={() => setViewingContractsPartner(p)}
                  >
                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: 12 }}>{idx + 1}</td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: p.is_locked ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 124, 65, 0.08)',
                          color: p.is_locked ? '#ef4444' : 'var(--accent-primary)',
                          border: p.is_locked ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(16, 124, 65, 0.2)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        {p.is_locked && <Lock size={11} />}
                        {p.code}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {p.name_vn}
                      </div>
                      {p.name_en && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          {p.name_en}
                        </div>
                      )}
                      {p.address && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, opacity: 0.85 }}>
                          📍 {p.address}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span
                        style={{
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'var(--bg-hover)',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {seedLabel(language, p.category) || t.partnerLabel}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {p.tax_id || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {p.representative && (
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                          👤 {p.representative}
                        </div>
                      )}
                      {(p.contact_person || p.contact) && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          📞 {p.contact_person || p.contact}
                        </div>
                      )}
                      {!p.representative && !p.contact_person && !p.contact && (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: contractCount > 0 ? 'var(--accent-primary)' : 'var(--text-muted)',
                          padding: contractCount > 0 ? '2px 8px' : '0',
                          borderRadius: 4,
                          background: contractCount > 0 ? 'rgba(16, 124, 65, 0.08)' : 'transparent',
                        }}
                      >
                        {contractCount}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 12,
                          color: activeCount > 0 ? 'var(--success-text)' : 'var(--text-muted)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: activeCount > 0 ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                        }}
                      >
                        {activeCount}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                        <button
                          onClick={() => handleToggleLock(p)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: '1px solid var(--border-subtle)',
                            background: p.is_locked ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-surface)',
                            color: p.is_locked ? '#ef4444' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                          title={p.is_locked ? t.unlockPartnerAction : t.lockPartnerAction}
                        >
                          {p.is_locked ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>

                        <button
                          onClick={() => handleOpenEdit(p)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                          title={t.editPartnerAction}
                        >
                          <Pencil size={13} />
                        </button>

                        <button
                          onClick={() => handleDelete(p)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-surface)',
                            color: '#ef4444',
                            cursor: 'pointer',
                          }}
                          title={t.deletePartnerAction}
                        >
                          <Trash2 size={13} />
                        </button>

                        <button
                          onClick={() => setViewingContractsPartner(p)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 8px',
                            borderRadius: 4,
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-surface)',
                            color: 'var(--accent-primary)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title={tf('partnerViewContractsTooltip', { name: p.name_vn })}
                        >
                          <span>{t.viewContractBtn} ({contractCount})</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPartners.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    {t.partnerNoResults}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Partner Modal */}
      <PartnerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => {
          setIsModalOpen(false);
          onRefreshPartners?.();
        }}
        partner={editingPartner}
      />

      {/* Partner Contracts Modal */}
      {viewingContractsPartner && (() => {
        const partner = viewingContractsPartner;
        const pContracts = contracts.filter(
          c => c.partner_code === partner.code ||
               (partner.code && c.contract_number.toUpperCase().includes(partner.code.toUpperCase())) ||
               c.party_b.toLowerCase().includes(partner.name_vn.toLowerCase()) ||
               (partner.name_en && c.party_b.toLowerCase().includes(partner.name_en.toLowerCase()))
        );

        return (
          <div className="modal-backdrop" onClick={() => setViewingContractsPartner(null)}>
            <div
              className="modal-content modal-structured"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 860, width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            >
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Building2 size={24} color="var(--accent-primary)" />
                  <div>
                    <h2 className="modal-title" style={{ fontSize: 18 }}>
                      {tf('partnerContractsTitle', { code: partner.code, name: partner.name_vn })}
                    </h2>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {partner.name_en ? `${partner.name_en} · ` : ''}
                      {tf('partnerContractsSummary', { taxId: partner.tax_id || '—', count: pContracts.length })}
                    </div>
                  </div>
                </div>
                <button
                  className="modal-close"
                  onClick={() => setViewingContractsPartner(null)}
                  type="button"
                  title={t.close}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {pContracts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <FileText size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>{t.partnerNoContracts}</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pContracts.map((c, i) => (
                      <div
                        key={c.id}
                        style={{
                          padding: '14px 16px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 16,
                          transition: 'all 0.15s ease',
                        }}
                        className="table-row-hover"
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-primary)' }}>
                              {c.contract_number}
                            </span>
                            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                              {c.contract_category || c.contract_type}
                            </span>
                            <UrgencyBadge urgency={c.urgency} />
                          </div>

                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                            {c.title}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <span>{t.valueLabel}: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrencyValue(c.value, c.currency || 'VND')} {getCurrencySymbol(c.currency || 'VND')}</strong></span>
                            <span>{t.signedDateLabel}: <strong>{c.signed_date || '—'}</strong></span>
                            <span>{t.endDateLabel}: <strong>{c.end_date || t.indefiniteTerm}</strong></span>
                            {c.department && <span>{t.inChargeLabel}: <strong>{c.department}</strong></span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => {
                              setViewingContractsPartner(null);
                              if (onSelectContract) {
                                onSelectContract(c);
                              } else if (onSelectPartnerContracts) {
                                onSelectPartnerContracts(partner.code);
                              }
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 12px',
                              borderRadius: 'var(--radius-md)',
                              background: 'var(--bg-hover)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--accent-primary)',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <span>{t.detailsBtn}</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.totalLinkedContracts} <strong>{pContracts.length}</strong> {t.linkedContractsWith} {partner.name_vn}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  {onSelectPartnerContracts && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                      onClick={() => {
                        const code = partner.code;
                        setViewingContractsPartner(null);
                        onSelectPartnerContracts(code);
                      }}
                    >
                      <ExternalLink size={13} style={{ marginRight: 4 }} />
                      {t.openInContractTable}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '6px 16px' }}
                    onClick={() => setViewingContractsPartner(null)}
                  >
                    {t.close}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
