import React from 'react';
import {
  Layers,
  FileCheck,
  AlertCircle,
  Clock,
  CheckCircle,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Bookmark,
  Building2,
  UploadCloud,
  Archive,
  AlertTriangle,
  UserCheck,
  SlidersHorizontal,
  Lock,
  Briefcase,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { canAccessLaborContracts } from '../../../server/types.ts';

export type NavFilter =
  | 'all'
  | 'contracts_all'
  | 'contracts_urgent'
  | 'contracts_warning'
  | 'contracts_active'
  | 'contracts_expired'
  | 'contracts_liquidated'
  | 'contracts_indefinite'
  | 'labor_all'
  | 'labor_urgent'
  | 'labor_warning'
  | 'labor_active'
  | 'labor_expired'
  | 'labor_liquidated'
  | 'labor_indefinite'
  | 'docs_all'
  | 'docs_incoming'
  | 'docs_incoming_overdue'
  | 'docs_incoming_expiring'
  | 'docs_incoming_processing'
  | 'docs_incoming_completed'
  | 'docs_incoming_unassigned'
  | 'docs_outgoing'
  | 'docs_outgoing_sent'
  | 'docs_outgoing_signing'
  | 'docs_decision'
  | 'docs_internal'
  | 'partners_all'
  | 'settings_all';

interface SidebarProps {
  currentFilter: NavFilter;
  onSelectFilter: (filter: NavFilter) => void;
  urgentCount: number;
  warningCount: number;
  activeCount?: number;
  expiredCount?: number;
  liquidatedCount?: number;
  indefiniteCount?: number;
  totalContracts: number;
  totalLaborContracts?: number;
  laborUrgentCount?: number;
  laborWarningCount?: number;
  laborActiveCount?: number;
  laborExpiredCount?: number;
  laborLiquidatedCount?: number;
  laborIndefiniteCount?: number;
  totalDocs: number;
  totalIncoming?: number;
  totalOutgoing?: number;
  totalInternal?: number;
  totalPartners?: number;
  incomingOverdue?: number;
  incomingExpiringSoon?: number;
  incomingProcessing?: number;
  incomingCompleted?: number;
  incomingUnassigned?: number;
  onOpenUpload: () => void;
  onOpenCreateLabor?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentFilter,
  onSelectFilter,
  urgentCount,
  warningCount,
  activeCount = 0,
  expiredCount = 0,
  liquidatedCount = 0,
  indefiniteCount = 0,
  totalContracts,
  totalLaborContracts = 0,
  laborUrgentCount = 0,
  laborWarningCount = 0,
  laborActiveCount = 0,
  laborExpiredCount = 0,
  laborLiquidatedCount = 0,
  laborIndefiniteCount = 0,
  totalDocs,
  totalIncoming = 0,
  totalOutgoing = 0,
  totalInternal = 0,
  totalPartners = 0,
  incomingOverdue = 0,
  incomingExpiringSoon = 0,
  incomingProcessing = 0,
  incomingCompleted = 0,
  incomingUnassigned = 0,
  onOpenUpload,
}) => {
  const { t, tf } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const hasLaborAccess = canAccessLaborContracts(user);

  return (
    <aside className="sidebar-pane">
      {/* Không gian */}
      <div>
        <div className="sidebar-group-title">{t.workspace}</div>
        <div
          className={`nav-item ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => onSelectFilter('all')}
        >
          <div className="nav-item-left">
            <Layers size={16} />
            <span>{t.allRecords}</span>
          </div>
          {/* The 'all' list includes labor contracts (0 for users without access) */}
          <span className="nav-count-badge">{totalContracts + (totalLaborContracts || 0) + totalDocs}</span>
        </div>
      </div>

      {/* Sổ Công văn Đến */}
      <div>
        <div className="sidebar-group-title">{t.incomingLog}</div>

        <div
          className={`nav-item ${currentFilter === 'docs_incoming' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_incoming')}
        >
          <div className="nav-item-left">
            <ArrowDownLeft size={16} color="var(--accent-primary)" />
            <span>{t.allIncomingDocs}</span>
          </div>
          <span className="nav-count-badge">{totalIncoming}</span>
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_incoming_overdue' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_incoming_overdue')}
        >
          <div className="nav-item-left">
            <AlertCircle size={15} color="var(--urgent-dot)" />
            <span>{t.overdueDocs}</span>
          </div>
          {incomingOverdue > 0 && (
            <span className="nav-count-badge urgent">{incomingOverdue}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_incoming_expiring' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_incoming_expiring')}
        >
          <div className="nav-item-left">
            <AlertTriangle size={15} color="#EA580C" />
            <span>{t.expiringSoon3d}</span>
          </div>
          {incomingExpiringSoon > 0 && (
            <span className="nav-count-badge warning">{incomingExpiringSoon}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_incoming_processing' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_incoming_processing')}
        >
          <div className="nav-item-left">
            <Clock size={15} color="#3B82F6" />
            <span>{t.inProgress}</span>
          </div>
          {incomingProcessing > 0 && (
            <span className="nav-count-badge">{incomingProcessing}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_incoming_completed' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_incoming_completed')}
        >
          <div className="nav-item-left">
            <CheckCircle size={15} color="var(--success-dot)" />
            <span>{t.completed}</span>
          </div>
          {incomingCompleted > 0 && (
            <span className="nav-count-badge">{incomingCompleted}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_incoming_unassigned' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_incoming_unassigned')}
        >
          <div className="nav-item-left">
            <UserCheck size={15} color="var(--text-muted)" />
            <span>{t.unassigned}</span>
          </div>
          {incomingUnassigned > 0 && (
            <span className="nav-count-badge">{incomingUnassigned}</span>
          )}
        </div>
      </div>

      {/* Sổ Công văn Đi */}
      <div>
        <div className="sidebar-group-title">{t.outgoingLog}</div>

        <div
          className={`nav-item ${currentFilter === 'docs_outgoing' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_outgoing')}
        >
          <div className="nav-item-left">
            <ArrowUpRight size={16} color="#6366F1" />
            <span>{t.allOutgoingDocs}</span>
          </div>
          <span className="nav-count-badge">{totalOutgoing}</span>
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_outgoing_sent' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_outgoing_sent')}
        >
          <div className="nav-item-left">
            <CheckCircle size={15} color="var(--success-dot)" />
            <span>{t.dispatched}</span>
          </div>
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_outgoing_signing' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_outgoing_signing')}
        >
          <div className="nav-item-left">
            <Clock size={15} color="#EA580C" />
            <span>{t.pendingSignature}</span>
          </div>
        </div>
      </div>

      {/* Văn bản Nội bộ & Quyết định */}
      <div>
        <div className="sidebar-group-title">{t.internalAndDecisions}</div>

        <div
          className={`nav-item ${currentFilter === 'docs_internal' || currentFilter === 'docs_decision' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_internal')}
        >
          <div className="nav-item-left">
            <FileText size={16} color="#059669" />
            <span>{t.internalDocsDecisions}</span>
          </div>
          <span className="nav-count-badge">{totalInternal}</span>
        </div>
      </div>

      {/* Hợp đồng kinh tế */}
      <div>
        <div className="sidebar-group-title">
          {tf('economicContractsTitle', { count: totalContracts })}
        </div>
        
        <div
          className={`nav-item ${currentFilter === 'contracts_all' ? 'active' : ''}`}
          onClick={() => onSelectFilter('contracts_all')}
        >
          <div className="nav-item-left">
            <FileCheck size={16} />
            <span>{t.allContracts}</span>
          </div>
          <span className="nav-count-badge">{totalContracts}</span>
        </div>

        <div
          className={`nav-item ${currentFilter === 'contracts_urgent' ? 'active' : ''}`}
          onClick={() => onSelectFilter('contracts_urgent')}
        >
          <div className="nav-item-left">
            <AlertCircle size={15} color="var(--urgent-dot)" />
            <span>{t.urgentContracts7d}</span>
          </div>
          {urgentCount > 0 && (
            <span className="nav-count-badge urgent">{urgentCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'contracts_warning' ? 'active' : ''}`}
          onClick={() => onSelectFilter('contracts_warning')}
        >
          <div className="nav-item-left">
            <Clock size={15} color="var(--warning-dot)" />
            <span>{t.expiringSoon30d}</span>
          </div>
          {warningCount > 0 && (
            <span className="nav-count-badge">{warningCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'contracts_active' ? 'active' : ''}`}
          onClick={() => onSelectFilter('contracts_active')}
        >
          <div className="nav-item-left">
            <CheckCircle size={15} color="var(--success-dot)" />
            <span>{t.activeContractsNav}</span>
          </div>
          {activeCount > 0 && (
            <span className="nav-count-badge">{activeCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'contracts_expired' ? 'active' : ''}`}
          onClick={() => onSelectFilter('contracts_expired')}
        >
          <div className="nav-item-left">
            <AlertCircle size={15} color="var(--urgent-dot)" />
            <span>{t.expiredContractsNav}</span>
          </div>
          {expiredCount > 0 && (
            <span className="nav-count-badge urgent">{expiredCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'contracts_liquidated' ? 'active' : ''}`}
          onClick={() => onSelectFilter('contracts_liquidated')}
        >
          <div className="nav-item-left">
            <Archive size={15} />
            <span>{t.liquidatedClosed}</span>
          </div>
          {liquidatedCount > 0 && (
            <span className="nav-count-badge">{liquidatedCount}</span>
          )}
        </div>

        <div
          className={`nav-item ${currentFilter === 'contracts_indefinite' ? 'active' : ''}`}
          onClick={() => onSelectFilter('contracts_indefinite')}
        >
          <div className="nav-item-left">
            <Bookmark size={15} color="var(--text-muted)" />
            <span>{t.indefiniteNav}</span>
          </div>
          {indefiniteCount > 0 && (
            <span className="nav-count-badge">{indefiniteCount}</span>
          )}
        </div>
      </div>

      {/* Hợp đồng Lao động (Mật - Chỉ Admin & người được phân quyền mới thấy) */}
      {hasLaborAccess && (
        <div>
          <div
            className="sidebar-group-title"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#F59E0B' }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Lock size={12} color="#F59E0B" />
              {tf('laborContractsTitle', { count: totalLaborContracts })}
            </span>
          </div>

          <div
            className={`nav-item ${currentFilter === 'labor_all' ? 'active' : ''}`}
            onClick={() => onSelectFilter('labor_all')}
          >
            <div className="nav-item-left">
              <Briefcase size={15} color="#F59E0B" />
              <span>{t.laborAll}</span>
            </div>
            <span className="nav-count-badge">{totalLaborContracts}</span>
          </div>

          <div
            className={`nav-item ${currentFilter === 'labor_urgent' ? 'active' : ''}`}
            onClick={() => onSelectFilter('labor_urgent')}
          >
            <div className="nav-item-left">
              <AlertCircle size={15} color="var(--urgent-dot)" />
              <span>{t.laborUrgentRenewal}</span>
            </div>
            {laborUrgentCount > 0 && (
              <span className="nav-count-badge urgent">{laborUrgentCount}</span>
            )}
          </div>

          <div
            className={`nav-item ${currentFilter === 'labor_warning' ? 'active' : ''}`}
            onClick={() => onSelectFilter('labor_warning')}
          >
            <div className="nav-item-left">
              <Clock size={15} color="var(--warning-dot)" />
              <span>{t.laborExpiringSoon}</span>
            </div>
            {laborWarningCount > 0 && (
              <span className="nav-count-badge">{laborWarningCount}</span>
            )}
          </div>

          <div
            className={`nav-item ${currentFilter === 'labor_active' ? 'active' : ''}`}
            onClick={() => onSelectFilter('labor_active')}
          >
            <div className="nav-item-left">
              <CheckCircle size={15} color="var(--success-dot)" />
              <span>{t.laborActiveFixedTerm}</span>
            </div>
            {laborActiveCount > 0 && (
              <span className="nav-count-badge">{laborActiveCount}</span>
            )}
          </div>

          <div
            className={`nav-item ${currentFilter === 'labor_expired' ? 'active' : ''}`}
            onClick={() => onSelectFilter('labor_expired')}
          >
            <div className="nav-item-left">
              <AlertCircle size={15} color="var(--urgent-dot)" />
              <span>{t.laborExpired}</span>
            </div>
            {laborExpiredCount > 0 && (
              <span className="nav-count-badge urgent">{laborExpiredCount}</span>
            )}
          </div>

          <div
            className={`nav-item ${currentFilter === 'labor_liquidated' ? 'active' : ''}`}
            onClick={() => onSelectFilter('labor_liquidated')}
          >
            <div className="nav-item-left">
              <Archive size={15} />
              <span>{t.laborTerminated}</span>
            </div>
            {laborLiquidatedCount > 0 && (
              <span className="nav-count-badge">{laborLiquidatedCount}</span>
            )}
          </div>

          <div
            className={`nav-item ${currentFilter === 'labor_indefinite' ? 'active' : ''}`}
            onClick={() => onSelectFilter('labor_indefinite')}
          >
            <div className="nav-item-left">
              <Bookmark size={15} color="#3B82F6" />
              <span>{t.laborIndefinite}</span>
            </div>
            {laborIndefiniteCount > 0 && (
              <span className="nav-count-badge">{laborIndefiniteCount}</span>
            )}
          </div>
        </div>
      )}

      {/* Đối tác */}
      <div>
        <div className="sidebar-group-title">{t.partnersTitle} ({totalPartners || 27})</div>
        <div
          className={`nav-item ${currentFilter === 'partners_all' ? 'active' : ''}`}
          onClick={() => onSelectFilter('partners_all')}
        >
          <div className="nav-item-left">
            <Building2 size={15} color="#D97706" />
            <span>{t.partnerDirectory}</span>
          </div>
          <span className="nav-count-badge">{totalPartners || 27}</span>
        </div>
      </div>

      {/* Danh mục & Thiết lập */}
      <div>
        <div className="sidebar-group-title">{t.systemTitle}</div>
        <div
          className={`nav-item ${currentFilter === 'settings_all' ? 'active' : ''}`}
          onClick={() => onSelectFilter('settings_all')}
        >
          <div className="nav-item-left">
            <SlidersHorizontal size={15} color="#6366F1" />
            <span>{t.settingsCategories}</span>
          </div>
        </div>
      </div>

      {/* Văn bản khác */}
      <div>
        <div className="sidebar-group-title">{t.otherDocsTitle}</div>

        <div
          className={`nav-item ${currentFilter === 'docs_all' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_all')}
        >
          <div className="nav-item-left">
            <FileText size={16} />
            <span>{t.allDocs}</span>
          </div>
          <span className="nav-count-badge">{totalDocs}</span>
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_decision' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_decision')}
        >
          <div className="nav-item-left">
            <Bookmark size={15} />
            <span>{t.decisions}</span>
          </div>
        </div>

        <div
          className={`nav-item ${currentFilter === 'docs_internal' ? 'active' : ''}`}
          onClick={() => onSelectFilter('docs_internal')}
        >
          <div className="nav-item-left">
            <Building2 size={15} />
            <span>{t.thematicDocs}</span>
          </div>
        </div>
      </div>

      {/* Quick Dropzone - Admin only */}
      {isAdmin && (
        <div className="quick-dropzone" onClick={onOpenUpload}>
          <UploadCloud size={24} color="var(--accent-primary)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {t.quickUploadTitle}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {t.quickUploadDesc}
          </span>
        </div>
      )}
    </aside>
  );
};
