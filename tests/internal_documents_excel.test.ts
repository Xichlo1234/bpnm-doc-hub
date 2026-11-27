import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as fs from 'node:fs';
import { set_fs } from 'xlsx';
import { describe, expect, it } from 'vitest';
import { documentExcelColumns, documentExcelFileName, exportToExcel, parseDocumentExcelRow, readExcelFile } from '../src/client/src/utils/excelHelper.ts';
import { store } from '../src/server/db/store.ts';
import { fetchAs } from './setup.ts';

// The SheetJS ESM build needs a filesystem adapter to save the browser export in a Node test.
set_fs(fs);

const admin = 'admin_root';
const viewer = 'user_viewer';
const preview = '/api/documents/import/preview';
const commit = '/api/documents/bulk-import';

function post(path: string, fields: Record<string, unknown>, user = admin) {
  return fetchAs(user, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
}

async function workbookRows(data: object[]) {
  const dir = await mkdtemp(join(tmpdir(), 'internal-docs-xlsx-'));
  const filename = join(dir, 'Documents.xlsx');
  try {
    exportToExcel(data, documentExcelColumns, filename, 'Documents');
    const file = new File([new Uint8Array(await readFile(filename))], 'Documents.xlsx');
    return (await readExcelFile(file)).map(parseDocumentExcelRow);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('Internal document Excel import and export', () => {
  it('names the exported workbook for the selected register and the local Vietnam date', () => {
    const now = new Date('2026-11-27T18:00:00Z');
    expect(documentExcelFileName('internal', 'docs_internal_incoming', now)).toBe('So_Quan_ly_Cong_van_internal_incoming_2026-11-28.xlsx');
    expect(documentExcelFileName('internal', 'docs_internal_outgoing', now)).toBe('So_Quan_ly_Cong_van_internal_outgoing_2026-11-28.xlsx');
    expect(documentExcelFileName('internal', 'docs_internal', now)).toBe('So_Quan_ly_Cong_van_internal_2026-11-28.xlsx');
    expect(documentExcelFileName('search', 'docs_all', now)).toBe('So_Quan_ly_Cong_van_search_2026-11-28.xlsx');
  });

  it('round-trips both directions and an undirected legacy document through a real workbook and both API steps', async () => {
    const source = [
      {
        doc_type: 'internal_incoming', document_number: 'NB-ĐẾN-2026-0101', original_doc_number: 'HC-052',
        title: 'Lịch trực', issuer: 'Hành chính', department: 'Kỹ thuật', handler: 'An',
        issue_date: '2026-04-05', received_date: '2026-04-06', due_date: '2026-04-09',
        directive: 'Bố trí nhân sự', security_level: 'Mật',
      },
      {
        doc_type: 'internal_outgoing', document_number: 'NB-ĐI-2026-0201', title: 'Phản hồi lịch trực',
        department: 'Kỹ thuật', recipient: 'Hành chính', signer: 'Bình', handler: 'Hà',
        issue_date: '2026-04-07', linked_doc_number: 'NB-ĐẾN-2026-0101', send_method: 'Email',
      },
      { doc_type: 'internal', document_number: 'NB-2010-A', title: 'Quy chế cũ', issue_date: '2010-03-09' },
    ];
    const rows = await workbookRows(source);
    rows.forEach((row, index) => expect(row).toMatchObject(source[index]));

    expect((await post(preview, { rows }, viewer)).status).toBe(403);
    expect((await post(commit, { rows }, viewer)).status).toBe(403);
    const response = await post(preview, { rows });
    expect(response.status).toBe(200);
    const plan = await response.json() as any;
    expect(plan.summary).toMatchObject({ create: 3, error: 0, update: 0 });
    expect(store.getDocuments().some(d => d.document_number === source[0].document_number)).toBe(false);
    const saved = await post(commit, { rows, preview_fingerprint: plan.preview_fingerprint });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ added: 3, updated: 0, skipped: 0 });

    const docs = source.map(row => store.getDocuments().find(d => d.document_number === row.document_number)!);
    docs.forEach((doc, index) => expect(doc).toMatchObject(source[index]));
    expect(docs[0].status).toBe('Đã phân công');
    expect(docs[1].status).toBe('Dự thảo');
    const exported = await workbookRows(docs);
    const again = await (await post(preview, { rows: exported })).json() as any;
    expect(again.summary).toMatchObject({ unchanged: 3, update: 0, error: 0 });
    const replay = await post(commit, { rows: exported, preview_fingerprint: again.preview_fingerprint });
    expect(await replay.json()).toMatchObject({ added: 0, updated: 0, skipped: 3 });
  });

  it('recognizes template labels, preserves ambiguous or invalid input for server validation, and enforces workflow rules', async () => {
    const fromTemplate = (type: string) => parseDocumentExcelRow({
      'Loại văn bản': type, 'Số văn bản (*)': 'XLSX-SHARED-01', 'Trích yếu / Tiêu đề (*)': 'Kiểm tra',
    });
    expect(fromTemplate('Văn bản nội bộ đến')).toMatchObject({ doc_type: 'internal_incoming' });
    expect(fromTemplate('Nội bộ đi')).toMatchObject({ doc_type: 'internal_outgoing' });
    expect(fromTemplate('Nội bộ')).toMatchObject({ doc_type: 'internal' });
    const shared = [fromTemplate('Nội bộ đến'), fromTemplate('Nội bộ đi')];
    expect(await (await post(commit, { rows: shared })).json()).toMatchObject({ added: 2 });
    const illegal = [
      fromTemplate(''),
      fromTemplate('internal_going'),
      { ...fromTemplate('Nội bộ đi'), document_number: 'XLSX-INVALID', status: 'Đã gửi', signer: '' },
    ];
    const rejected = await (await post(preview, { rows: illegal })).json() as any;
    expect(rejected.summary.error).toBe(3);
    expect(rejected.rows.map((row: { errors: string[] }) => row.errors.join(' '))).toEqual([
      expect.stringContaining('doc_type'), expect.stringContaining('doc_type'), expect.stringContaining('signer'),
    ]);
    expect((await post(commit, { rows: illegal })).status).toBe(400);
    expect(store.getDocuments().some(d => d.document_number === 'XLSX-INVALID')).toBe(false);
  });
});
