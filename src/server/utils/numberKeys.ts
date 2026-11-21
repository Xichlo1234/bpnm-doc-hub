// Normalised business numbers and their uniqueness scope (migration 0008: number_registry).

export function normalizeNumber(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Documents: one register per document type. Contracts: one register. */
export function numberScope(recordType: 'document' | 'contract', record: { doc_type?: string | null }): string {
  return recordType === 'contract' ? 'contract' : `doc:${record.doc_type || 'other'}`;
}

export function numberOf(recordType: 'document' | 'contract', record: Record<string, any>): string {
  return recordType === 'contract' ? record.contract_number : record.document_number;
}

/** "scope|normalised number", or null when the record has no number */
export function numberKey(recordType: 'document' | 'contract', record: Record<string, any>): string | null {
  const norm = normalizeNumber(numberOf(recordType, record));
  return norm ? `${numberScope(recordType, record)}|${norm}` : null;
}
