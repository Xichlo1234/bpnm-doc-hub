import React, { useState, useEffect, useRef } from 'react';
import { Search, X, FileText, FileCheck, ArrowRight, CornerDownLeft } from 'lucide-react';
import { api } from '../services/api.ts';
import type { DocumentRecord, ContractRecord } from '../../../server/types.ts';
import type { UnifiedItem } from './ItemList.tsx';
import { UrgencyBadge } from './UrgencyBadge.tsx';

import { useLanguage } from '../context/LanguageContext.tsx';
import { documentDeadlineLabel } from '../i18n/index.ts';

interface SpotlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: UnifiedItem) => void;
}

export const SpotlightModal: React.FC<SpotlightModalProps> = ({
  isOpen,
  onClose,
  onSelectItem,
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ documents: DocumentRecord[]; contracts: ContractRecord[] }>({
    documents: [],
    contracts: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      search(query);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const search = async (q: string) => {
    setIsLoading(true);
    try {
      const data = await api.searchAll(q);
      setResults(data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    search(val);
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalResults = results.contracts.length + results.documents.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 640, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--bg-surface)',
          }}
        >
          <Search size={20} color="var(--accent-primary)" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t.spotlightInputPlaceholder}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text-primary)',
            }}
          />
          {query && (
            <button
              onClick={() => handleQueryChange('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          )}
          <span className="spotlight-shortcut" style={{ fontSize: 10 }}>ESC</span>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '12px 14px' }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {t.spotlightSearching}
            </div>
          ) : totalResults === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
              {t.spotlightNotFound} "{query}"
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Contracts section */}
              {results.contracts.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      padding: '4px 8px 8px 8px',
                    }}
                  >
                    {t.spotlightContractsSection} ({results.contracts.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {results.contracts.map(c => (
                      <div
                        key={`spotlight-contract-${c.id}`}
                        onClick={() => {
                          onSelectItem({ kind: 'contract', data: c });
                          onClose();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          transition: 'background 0.1s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
                          <FileCheck size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {c.title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {c.contract_number} · {t.partnerLabel}: {c.party_b}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UrgencyBadge urgency={c.urgency} />
                          <ArrowRight size={14} color="var(--text-muted)" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents section */}
              {results.documents.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      padding: '4px 8px 8px 8px',
                    }}
                  >
                    {t.spotlightDocsSection} ({results.documents.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {results.documents.map(d => (
                      <div
                        key={`spotlight-doc-${d.id}`}
                        onClick={() => {
                          onSelectItem({ kind: 'document', data: d });
                          onClose();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          transition: 'background 0.1s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
                          <FileText size={16} color={d.doc_type === 'incoming' ? 'var(--accent-primary)' : '#6366F1'} style={{ flexShrink: 0 }} />
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {d.title}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span className="mono-code" style={{ fontSize: 10 }}>{d.document_number}</span>
                              {d.original_doc_number && (
                                <span style={{ color: '#2563EB', fontWeight: 600 }}>({d.original_doc_number})</span>
                              )}
                              <span>·</span>
                              <span>{d.issuer || d.recipient || t.docTypeInternal}</span>
                              {d.directive && (
                                <span style={{ color: '#B45309', fontStyle: 'italic' }}>· {t.directiveShort}: {d.directive.slice(0, 35)}...</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {d.deadline_status ? (
                            <span className={`status-badge ${d.deadline_status.badgeType}`} style={{ fontSize: 10 }}>
                              {documentDeadlineLabel(t, d.deadline_status)}
                            </span>
                          ) : (
                            <span className="urgency-badge info">{d.doc_category || d.doc_type}</span>
                          )}
                          <ArrowRight size={14} color="var(--text-muted)" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Hint */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-subtle)',
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{t.spotlightFooterHint}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <CornerDownLeft size={12} /> {t.spotlightOpenHint}
          </span>
        </div>
      </div>
    </div>
  );
};
