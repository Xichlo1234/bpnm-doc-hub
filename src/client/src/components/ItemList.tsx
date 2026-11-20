import React, { useState } from 'react';
import { Search } from 'lucide-react';
import type { DocumentRecord, ContractRecord } from '../../../server/types.ts';
import { UrgencyBadge } from './UrgencyBadge.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { documentDeadlineLabel } from '../i18n/index.ts';

export type UnifiedItem =
  | { kind: 'contract'; data: ContractRecord }
  | { kind: 'document'; data: DocumentRecord };

interface ItemListProps {
  title: string;
  items: UnifiedItem[];
  selectedItem: UnifiedItem | null;
  onSelectItem: (item: UnifiedItem) => void;
  isLoading: boolean;
}

export const ItemList: React.FC<ItemListProps> = ({
  title,
  items,
  selectedItem,
  onSelectItem,
  isLoading,
}) => {
  const { t } = useLanguage();
  const [filterText, setFilterText] = useState('');

  const filteredItems = items.filter(item => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase();
    if (item.kind === 'contract') {
      return (
        item.data.title.toLowerCase().includes(q) ||
        item.data.contract_number.toLowerCase().includes(q) ||
        item.data.party_b.toLowerCase().includes(q)
      );
    } else {
      return (
        item.data.title.toLowerCase().includes(q) ||
        item.data.document_number.toLowerCase().includes(q) ||
        (item.data.issuer && item.data.issuer.toLowerCase().includes(q))
      );
    }
  });

  const getFileBadge = (fileName: string | null | undefined, docType?: string) => {
    const ext = fileName ? fileName.split('.').pop()?.toUpperCase() : '';
    if (ext === 'PPTX' || ext === 'PPT') {
      return <div className="file-type-icon pptx">PPTX</div>;
    }
    if (ext === 'DOCX' || ext === 'DOC') {
      return <div className="file-type-icon docx">DOC</div>;
    }
    if (ext === 'PDF') {
      return <div className="file-type-icon pdf">PDF</div>;
    }
    return <div className="file-type-icon pdf">PDF</div>;
  };

  return (
    <div className="list-pane">
      {/* List Header */}
      <div className="list-header">
        <div className="list-title-row">
          <span className="list-title">{title}</span>
          <span className="list-count">{filteredItems.length} {t.listRecordsUnit}</span>
        </div>

        <div className="list-search-box">
          <Search size={15} color="var(--text-muted)" />
          <input
            type="text"
            className="list-search-input"
            placeholder={t.listSearchPlaceholder}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
        </div>
      </div>

      {/* List Scroll Area */}
      <div className="list-scroll-area">
        {isLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {t.listLoading}
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {t.listNotFound}
          </div>
        ) : (
          filteredItems.map(item => {
            const isSelected =
              selectedItem &&
              selectedItem.kind === item.kind &&
              selectedItem.data.id === item.data.id;

            if (item.kind === 'contract') {
              const c = item.data;
              return (
                <div
                  key={`contract-${c.id}`}
                  className={`record-card ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectItem(item)}
                >
                  <div className="record-card-top">
                    {getFileBadge(c.file_name)}
                    <div className="record-card-info">
                      <div className="record-card-title">{c.title}</div>
                      <div className="record-card-subtitle">
                        {c.contract_number} · {c.party_b}
                      </div>
                    </div>
                  </div>

                  <div className="record-card-bottom">
                    <UrgencyBadge urgency={c.urgency} />
                    <span className="record-card-date">
                      {c.end_date ? c.end_date : t.indefiniteTerm}
                    </span>
                  </div>
                </div>
              );
            } else {
              const d = item.data;
              const typeNames: Record<string, string> = {
                incoming: t.docTypeIncomingShort,
                outgoing: t.docTypeOutgoingShort,
                decision: t.decisions,
                internal: t.docTypeInternal,
                other: t.docTypeOther,
              };

              const ds = d.deadline_status;

              return (
                <div
                  key={`doc-${d.id}`}
                  className={`record-card ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectItem(item)}
                >
                  <div className="record-card-top">
                    {getFileBadge(d.file_name, d.doc_type)}
                    <div className="record-card-info">
                      <div className="record-card-title">{d.title}</div>
                      <div className="record-card-subtitle">
                        {d.document_number}
                        {d.original_doc_number && ` (${d.original_doc_number})`} · {d.issuer || d.recipient || t.docTypeInternal}
                      </div>
                    </div>
                  </div>

                  <div className="record-card-bottom">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="urgency-badge info" style={{ fontSize: 10, padding: '2px 6px' }}>
                        {typeNames[d.doc_type] || d.doc_category || d.doc_type}
                      </span>
                      {ds && (
                        <span className={`status-badge ${ds.badgeType}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                          {documentDeadlineLabel(t, ds)}
                        </span>
                      )}
                    </div>
                    <span className="record-card-date">{d.received_date || d.issue_date}</span>
                  </div>
                </div>
              );
            }
          })
        )}
      </div>
    </div>
  );
};
