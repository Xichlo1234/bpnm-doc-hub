import React, { useState, useEffect } from 'react';
import {
  History,
  User,
  Calendar,
  Search,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api.ts';
import type { AuditLogRecord } from '../../../server/types.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { formatSystemDateTime } from '../utils/dateTime.ts';

export const AuditLogView: React.FC = () => {
  const { t } = useLanguage();

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAuditLogs();
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (entityFilter !== 'all' && log.entity_type !== entityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchUser = log.username?.toLowerCase().includes(q);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(q) : false;
      const matchAction = log.action?.toLowerCase().includes(q);
      const matchEntity = log.entity_id?.toLowerCase().includes(q);
      if (!matchUser && !matchDetails && !matchAction && !matchEntity) return false;
    }
    return true;
  });

  const getActionBadge = (action: string) => {
    let bg = 'rgba(252, 207, 77, 0.1)';
    let color = 'var(--accent-primary)';
    let label = action;

    if (action === 'LOGIN') {
      bg = 'rgba(159, 174, 74, 0.1)';
      color = '#059669';
      label = t.auditLogin;
    } else if (action === 'CREATE') {
      bg = 'rgba(159, 174, 74, 0.15)';
      color = '#059669';
      label = t.auditCreate;
    } else if (action === 'UPDATE') {
      bg = 'rgba(245, 158, 11, 0.15)';
      color = '#D97706';
      label = t.auditUpdate;
    } else if (action === 'DELETE') {
      bg = 'rgba(239, 68, 68, 0.15)';
      color = '#DC2626';
      label = t.auditDelete;
    } else if (action === 'IMPORT') {
      bg = 'rgba(139, 92, 246, 0.15)';
      color = '#7C3AED';
      label = t.auditExcelImport;
    }

    return (
      <span
        style={{
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          background: bg,
          color: color,
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top Banner */}
      <div
        style={{
          padding: '16px 24px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(252, 207, 77, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
            }}
          >
            <History size={20} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.auditSystemActivityAuditLogs}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              {t.auditTracksAllSensitiveOperationsLogin}
            </p>
          </div>
        </div>

        <button
          onClick={fetchLogs}
          className="btn-secondary"
          disabled={isLoading}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          <span>{t.auditRefresh}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          padding: '12px 24px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: 32 }}
            placeholder={t.auditSearchByAccountDocumentContract}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {t.auditAction}
          </span>
          <select
            className="form-select"
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="all">{t.auditAll}</option>
            <option value="LOGIN">{t.auditLogin2}</option>
            <option value="CREATE">{t.auditCreate2}</option>
            <option value="UPDATE">{t.actionUpdate}</option>
            <option value="DELETE">{t.delete}</option>
            <option value="IMPORT">{t.auditExcelImport2}</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
            {t.auditEntity}
          </span>
          <select
            className="form-select"
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="all">{t.auditAll}</option>
            <option value="auth">{t.auditAuth}</option>
            <option value="contract">{t.contractWord}</option>
            <option value="document">{t.documentWord}</option>
            <option value="partner">{t.partnerLabel}</option>
            <option value="category">{t.auditCategory}</option>
            <option value="user">{t.auditUser}</option>
          </select>
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
          {t.docFooterDisplaying} <strong>{filteredLogs.length}</strong> / {logs.length} {t.recordsUnit}
        </span>
      </div>

      {/* Logs Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.auditTimeGmt7}</th>
              <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.auditAccount}</th>
              <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.auditAction2}</th>
              <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.auditEntity2}</th>
              <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.auditIdKey}</th>
              <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.detailsBtn}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  {t.auditNoMatchingAuditLogRecords}
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr
                  key={log.id}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    fontSize: 13,
                  }}
                >
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={13} color="var(--text-muted)" />
                      <span>{formatSystemDateTime(log.timestamp)}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={13} color="var(--accent-primary)" />
                      <span>{log.username}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{getActionBadge(log.action)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {log.entity_type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    {log.entity_id || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', maxWidth: 350, wordBreak: 'break-word', color: 'var(--text-secondary)' }}>
                    {log.details ? (
                      <span style={{ fontSize: 12 }}>
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
