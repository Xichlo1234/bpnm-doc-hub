import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { store } from '../src/server/db/store.ts';

describe('Excel Import & Export Logic', () => {
  it('generates and reads back an excel worksheet via xlsx', () => {
    const data = [
      { id: 'c1', contract_number: 'HĐ-TEST-01', title: 'Hợp đồng kiểm thử 1', value: 1000 },
      { id: 'c2', contract_number: 'HĐ-TEST-02', title: 'Hợp đồng kiểm thử 2', value: 2500 },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contracts');

    const outBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    expect(outBuffer.length).toBeGreaterThan(0);

    // Read back
    const readBook = XLSX.read(outBuffer, { type: 'buffer' });
    expect(readBook.SheetNames[0]).toBe('Contracts');
    const readData = XLSX.utils.sheet_to_json(readBook.Sheets['Contracts']);
    expect(readData.length).toBe(2);
  });

  it('correctly bulk upserts documents with duplicate updating and new record insertion', () => {
    store.reset();
    const existing = store.createDocument({
      document_number: 'DOC-EXISTING-01',
      title: 'Văn bản gốc',
      doc_type: 'incoming',
      issue_date: '2026-01-01',
    } as any);

    const importBatch = [
      // Update existing
      {
        id: existing.id,
        document_number: 'DOC-EXISTING-01',
        title: 'Văn bản gốc ĐÃ CẬP NHẬT TIÊU ĐỀ',
      },
      // Insert new
      {
        document_number: 'DOC-BRAND-NEW-02',
        title: 'Văn bản mới toanh từ Excel',
        doc_type: 'outgoing' as const,
        issue_date: '2026-02-15',
      },
    ];

    const result = store.bulkUpsertDocuments(importBatch);
    expect(result.updated).toBe(1);
    expect(result.added).toBe(1);

    const checkUpdated = store.getDocument(existing.id);
    expect(checkUpdated?.title).toBe('Văn bản gốc ĐÃ CẬP NHẬT TIÊU ĐỀ');

    const checkNew = store.getDocuments().find(d => d.document_number === 'DOC-BRAND-NEW-02');
    expect(checkNew).toBeDefined();
    expect(checkNew?.title).toBe('Văn bản mới toanh từ Excel');

    // Clean up created records
    store.deleteDocument(existing.id);
    if (checkNew) store.deleteDocument(checkNew.id);
  });
});
