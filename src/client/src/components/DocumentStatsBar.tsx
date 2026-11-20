import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.tsx';

interface DocumentStatsBarProps {
  stats: {
    totalIncoming?: number;
    totalOutgoing?: number;
    incomingProcessing?: number;
    incomingOverdue?: number;
    incomingExpiringSoon?: number;
    incomingCompleted?: number;
    onTimeRate?: number;
  } | null;
  currentFilter: string;
  onSelectFilter: (filter: any) => void;
}

export const DocumentStatsBar: React.FC<DocumentStatsBarProps> = ({
  stats,
  currentFilter,
  onSelectFilter,
}) => {
  const { t, tf } = useLanguage();
  if (!stats) return null;

  const cards = [
    {
      id: 'docs_incoming',
      label: t.totalIncomingStat,
      value: stats.totalIncoming ?? 0,
      icon: <ArrowDownLeft size={16} color="var(--accent-primary)" />,
      badgeClass: '',
      active: currentFilter === 'docs_incoming' || currentFilter === 'docs_all',
    },
    {
      id: 'docs_outgoing',
      label: t.totalOutgoingStat,
      value: stats.totalOutgoing ?? 0,
      icon: <ArrowUpRight size={16} color="#6366F1" />,
      badgeClass: '',
      active: currentFilter === 'docs_outgoing',
    },
    {
      id: 'docs_incoming_processing',
      label: t.processingStat,
      value: stats.incomingProcessing ?? 0,
      icon: <Clock size={16} color="#3B82F6" />,
      badgeClass: 'info',
      active: currentFilter === 'docs_incoming_processing',
    },
    {
      id: 'docs_incoming_overdue',
      label: t.overdueStat,
      value: stats.incomingOverdue ?? 0,
      icon: <AlertCircle size={16} color="var(--urgent-dot)" />,
      badgeClass: 'urgent',
      active: currentFilter === 'docs_incoming_overdue',
    },
    {
      id: 'docs_incoming_expiring',
      label: t.expiringSoon3dStat,
      value: stats.incomingExpiringSoon ?? 0,
      icon: <AlertTriangle size={16} color="#EA580C" />,
      badgeClass: 'warning',
      active: currentFilter === 'docs_incoming_expiring',
    },
    {
      id: 'docs_incoming_completed',
      label: t.onTimeRateStat,
      value: `${stats.onTimeRate ?? 100}%`,
      subtext: `${stats.incomingCompleted ?? 0} ${t.completedStatSuffix}`,
      icon: <CheckCircle size={16} color="var(--success-dot)" />,
      badgeClass: 'success',
      active: currentFilter === 'docs_incoming_completed',
    },
  ];

  return (
    <div className="contract-stats-bar">
      {cards.map(c => (
        <div
          key={c.id}
          className={`stat-card ${c.active ? 'active-filter' : ''}`}
          onClick={() => onSelectFilter(c.id)}
          title={tf('filterBy', { label: c.label })}
        >
          <div className="stat-card-header">
            <span className="stat-card-label">{c.label}</span>
            <div className="stat-card-icon">{c.icon}</div>
          </div>
          <div className="stat-card-value-row">
            <span className={`stat-card-value ${c.badgeClass}`}>{c.value}</span>
            {c.subtext && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                {c.subtext}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
