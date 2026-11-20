import React from 'react';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Archive,
  HelpCircle,
  Lock,
} from 'lucide-react';
import type { NavFilter } from './Sidebar.tsx';

import { useLanguage } from '../context/LanguageContext.tsx';

interface ContractStatsBarProps {
  stats: {
    totalContracts: number;
    activeCount: number;
    urgentCount: number;
    warningCount: number;
    noticeCount: number;
    expiredCount: number;
    liquidatedCount: number;
    indefiniteCount: number;
    totalLaborContracts?: number;
    laborActiveCount?: number;
    laborUrgentCount?: number;
    laborWarningCount?: number;
    laborExpiredCount?: number;
    laborLiquidatedCount?: number;
    laborIndefiniteCount?: number;
  } | null;
  currentFilter: NavFilter;
  onSelectFilter: (filter: NavFilter) => void;
}

export const ContractStatsBar: React.FC<ContractStatsBarProps> = ({
  stats,
  currentFilter,
  onSelectFilter,
}) => {
  const { t } = useLanguage();
  if (!stats) return null;

  const isLabor = currentFilter.startsWith('labor');

  const expiringSoonCount = isLabor
    ? (stats.laborUrgentCount || 0) + (stats.laborWarningCount || 0)
    : (stats.urgentCount || 0) + (stats.warningCount || 0) + (stats.noticeCount || 0);

  const statItems = isLabor
    ? [
        {
          id: 'labor_all' as NavFilter,
          label: t.laborTotalStat,
          count: stats.totalLaborContracts || 0,
          icon: <Lock size={15} color="#F59E0B" />,
          badgeClass: '',
          color: '#F59E0B',
        },
        {
          id: 'labor_active' as NavFilter,
          label: t.activeCountStat,
          count: stats.laborActiveCount || 0,
          icon: <CheckCircle2 size={15} color="var(--success-dot)" />,
          badgeClass: 'success',
          color: 'var(--success-text)',
        },
        {
          id: 'labor_warning' as NavFilter,
          label: t.expiringSoonStat,
          count: expiringSoonCount,
          icon: <Clock size={15} color="var(--warning-dot)" />,
          badgeClass: 'warning',
          color: 'var(--warning-text)',
        },
        {
          id: 'labor_expired' as NavFilter,
          label: t.expiredCountStat,
          count: stats.laborExpiredCount || 0,
          icon: <AlertTriangle size={15} color="var(--urgent-dot)" />,
          badgeClass: 'urgent',
          color: 'var(--urgent-text)',
        },
        {
          id: 'labor_liquidated' as NavFilter,
          label: t.laborTerminated,
          count: stats.laborLiquidatedCount || 0,
          icon: <Archive size={15} color="var(--text-muted)" />,
          badgeClass: 'gray',
          color: 'var(--text-secondary)',
        },
        {
          id: 'labor_indefinite' as NavFilter,
          label: t.laborIndefiniteStat,
          count: stats.laborIndefiniteCount || 0,
          icon: <HelpCircle size={15} color="var(--accent-blue)" />,
          badgeClass: 'info',
          color: 'var(--accent-blue)',
        },
      ]
    : [
        {
          id: 'contracts_all' as NavFilter,
          label: t.totalContractsStat,
          count: stats.totalContracts,
          icon: <FileText size={15} color="var(--accent-primary)" />,
          badgeClass: '',
          color: 'var(--text-primary)',
        },
        {
          id: 'contracts_active' as NavFilter,
          label: t.activeCountStat,
          count: stats.activeCount,
          icon: <CheckCircle2 size={15} color="var(--success-dot)" />,
          badgeClass: 'success',
          color: 'var(--success-text)',
        },
        {
          id: 'contracts_warning' as NavFilter,
          label: t.expiringSoonStat,
          count: expiringSoonCount,
          icon: <Clock size={15} color="var(--warning-dot)" />,
          badgeClass: 'warning',
          color: 'var(--warning-text)',
        },
        {
          id: 'contracts_expired' as NavFilter,
          label: t.expiredCountStat,
          count: stats.expiredCount,
          icon: <AlertTriangle size={15} color="var(--urgent-dot)" />,
          badgeClass: 'urgent',
          color: 'var(--urgent-text)',
        },
        {
          id: 'contracts_liquidated' as NavFilter,
          label: t.completedCountStat,
          count: stats.liquidatedCount,
          icon: <Archive size={15} color="var(--text-muted)" />,
          badgeClass: 'gray',
          color: 'var(--text-secondary)',
        },
        {
          id: 'contracts_indefinite' as NavFilter,
          label: t.indefiniteCountStat,
          count: stats.indefiniteCount || 0,
          icon: <HelpCircle size={15} color="var(--accent-blue)" />,
          badgeClass: 'info',
          color: 'var(--accent-blue)',
        },
      ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 10,
        padding: '12px 16px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {statItems.map(item => {
        const isActive = currentFilter === item.id;
        return (
          <div
            key={item.id}
            onClick={() => onSelectFilter(item.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: isActive ? 'var(--accent-light)' : 'var(--bg-surface-subtle)',
              border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                {item.label}
              </span>
              {item.icon}
            </div>

            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>
              {item.count}
            </div>
          </div>
        );
      })}
    </div>
  );
};
