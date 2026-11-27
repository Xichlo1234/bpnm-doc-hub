import * as XLSX from 'xlsx';
import { DOCUMENT_TYPES, type DocumentRecord, type NumberedDocumentType } from '../../../server/types.ts';
import { vietnamToday } from '../../../server/utils/workflow.ts';
import type { NavFilter } from '../components/Sidebar.tsx';
import { normalizeVietnamese } from './text.ts';

export interface ExcelColumnMapping<T> {
  header: string;
  key: keyof T | string;
  width?: number;
  format?: (val: any, row: T) => any;
  parse?: (val: any) => any;
}

export function documentExcelFileName(tab: NumberedDocumentType | 'internal' | 'search', filter?: NavFilter, now = new Date()): string {
  let register = tab;
  if (tab === 'internal' && filter === 'docs_internal_incoming') register = 'internal_incoming';
  if (tab === 'internal' && filter === 'docs_internal_outgoing') register = 'internal_outgoing';
  return `So_Quan_ly_Cong_van_${register}_${vietnamToday(now)}.xlsx`;
}

// i18n-data: these headers and aliases are the spreadsheet interchange format across UI languages.
export const documentExcelColumns = [
  { header: 'ID (Không sửa nếu cập nhật)', key: 'id', width: 20, aliases: ['id (', 'mã định danh'] },
  { header: 'Số hiệu văn bản', key: 'document_number', width: 18, aliases: ['số văn bản', 'số công văn'] },
  { header: 'Số gốc / Ký hiệu', key: 'original_doc_number', width: 18 },
  { header: 'Trích yếu nội dung', key: 'title', width: 35, aliases: ['trích yếu', 'tiêu đề'] },
  { header: 'Loại VB', key: 'doc_type', width: 22, aliases: ['loại văn bản', 'loại'] },
  { header: 'Phân loại', key: 'doc_category', width: 14 },
  { header: 'Cơ quan ban hành / Gửi', key: 'issuer', width: 25, aliases: ['cơ quan', 'nơi gửi'] },
  { header: 'Nơi nhận', key: 'recipient', width: 25 },
  { header: 'Người ký', key: 'signer', width: 18 },
  { header: 'Bộ phận xử lý', key: 'department', width: 16, aliases: ['phòng ban', 'bộ phận'] },
  { header: 'Người xử lý', key: 'handler', width: 18 },
  { header: 'Ngày ban hành', key: 'issue_date', width: 14, aliases: ['ngày văn bản'] },
  { header: 'Ngày đến', key: 'received_date', width: 14 },
  { header: 'Hạn xử lý', key: 'due_date', width: 14 },
  { header: 'Độ khẩn', key: 'urgency_level', width: 12, aliases: ['urgency'] },
  { header: 'Độ mật', key: 'security_level', width: 12 },
  { header: 'Trạng thái', key: 'status', width: 16 },
  { header: 'Ý kiến chỉ đạo', key: 'directive', width: 30, aliases: ['chỉ đạo'] },
  { header: 'Số văn bản liên kết', key: 'linked_doc_number', width: 22 },
  { header: 'Hình thức gửi', key: 'send_method', width: 18 },
  { header: 'Nơi lưu trữ', key: 'storage_location', width: 20 },
] satisfies Array<ExcelColumnMapping<DocumentRecord> & { key: keyof DocumentRecord; aliases?: string[] }>;

/** Accept both exported headers and the import template. Extra columns survive a round trip. */
export function parseDocumentExcelRow(raw: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = Object.create(null);
  for (const [header, cell] of Object.entries(raw)) {
    const name = normalizeVietnamese(header.trim());
    const column = documentExcelColumns.find(c => c.key === name || normalizeVietnamese(c.header) === name)
      ?? documentExcelColumns.find(c => [c.header, ...(c.aliases ?? [])].some(alias => name.startsWith(normalizeVietnamese(alias))));
    if (!column) {
      row[header] = cell;
      continue;
    }
    const value = String(cell ?? '').trim();
    if (column.key === 'doc_type') {
      // An omitted type lets the server resolve the register by ID or number and detect ambiguous numbers.
      if (!value) continue;
      const type = normalizeVietnamese(value).replace(/^van ban /, '');
      if (type === 'noi bo den') row.doc_type = 'internal_incoming';
      else if (type === 'noi bo di') row.doc_type = 'internal_outgoing';
      else if (type === 'noi bo') row.doc_type = 'internal';
      else row.doc_type = DOCUMENT_TYPES.find(code => code === type) ?? value;
    } else if (column.key !== 'id' || value) {
      row[column.key] = value;
    }
  }
  return row;
}

/**
 * Export data array to an Excel (.xlsx) file and trigger browser download
 */
export function exportToExcel<T>(
  data: T[],
  columns: ExcelColumnMapping<T>[],
  fileName: string,
  sheetName = 'Sheet1'
) {
  const headers = columns.map(c => c.header);

  const rows = data.map(row => {
    return columns.map(col => {
      const rawVal = (row as any)[col.key];
      if (col.format) {
        return col.format(rawVal, row);
      }
      return rawVal === null || rawVal === undefined ? '' : rawVal;
    });
  });

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  worksheet['!cols'] = columns.map(c => ({
    wch: c.width || Math.max(c.header.length + 4, 12),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const safeFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, safeFileName);
}

/**
 * Read uploaded Excel file (.xlsx or .csv) and return array of objects
 */
export async function readExcelFile(file: File): Promise<any[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) return [];

  // Parse as json array of objects using first row as headers
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  return jsonData;
}

/**
 * Generate a template Excel file with predefined headers and sample row
 */
export function downloadExcelTemplate(
  columns: Array<{ header: string; sample?: string; width?: number }>,
  fileName: string
) {
  const headers = columns.map(c => c.header);
  const sampleRow = columns.map(c => c.sample || '');

  const worksheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  worksheet['!cols'] = columns.map(c => ({
    wch: c.width || Math.max(c.header.length + 4, 15),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
  XLSX.writeFile(workbook, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
