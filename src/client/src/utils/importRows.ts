// Turns spreadsheet rows into import rows for the server preview. Rules that protect existing data:
//  - a column is mapped by its exact header (export/template header or field name), never by a
//    substring ("Mã số thuế đối tác" is not the id column);
//  - an empty or missing cell is NOT sent, so an update only changes the columns the file fills in —
//    nothing is replaced by a default value;
//  - columns that are not known fields are kept (stored with the record, as on export);
//  - the register (doc_type) is sent only when the file states it; the server refuses an ambiguous row.

export type ImportRowKind = 'document' | 'contract';

const ALIASES: Record<ImportRowKind, Record<string, string[]>> = {
  // i18n-data: Vietnamese column names of the export and template files
  document: {
    id: ['id', 'mã định danh'], // i18n-data
    document_number: ['số hiệu văn bản', 'số văn bản', 'số công văn'], // i18n-data
    original_doc_number: ['số gốc / ký hiệu', 'số gốc'], // i18n-data
    title: ['trích yếu nội dung', 'trích yếu / tiêu đề', 'trích yếu', 'tiêu đề'], // i18n-data
    doc_type: ['loại vb', 'loại văn bản'], // i18n-data
    doc_category: ['phân loại'], // i18n-data
    issuer: ['cơ quan ban hành / gửi', 'cơ quan ban hành / gửi đến', 'cơ quan ban hành', 'nơi gửi'], // i18n-data
    recipient: ['nơi nhận'], // i18n-data
    signer: ['người ký'], // i18n-data
    department: ['bộ phận xử lý', 'phòng ban phụ trách', 'phòng ban', 'bộ phận'], // i18n-data
    handler: ['người xử lý'], // i18n-data
    issue_date: ['ngày ban hành', 'ngày văn bản'], // i18n-data
    received_date: ['ngày đến'], // i18n-data
    due_date: ['hạn xử lý'], // i18n-data
    urgency_level: ['độ khẩn'], // i18n-data
    security_level: ['độ mật'], // i18n-data
    status: ['trạng thái'], // i18n-data
    directive: ['ý kiến chỉ đạo', 'chỉ đạo'], // i18n-data
    storage_location: ['nơi lưu trữ'], // i18n-data
    notes: ['ghi chú'], // i18n-data
    summary: ['tóm tắt'], // i18n-data
  },
  contract: {
    id: ['id', 'mã định danh'], // i18n-data
    contract_number: ['số hợp đồng', 'so hop dong'], // i18n-data
    title: ['tên / nội dung hợp đồng', 'tên hợp đồng', 'nội dung'], // i18n-data
    title_en: ['tên tiếng anh'], // i18n-data
    contract_category: ['loại hđ', 'loại hợp đồng'], // i18n-data
    party_a: ['bên a'], // i18n-data
    party_b: ['bên b', 'đối tác bên b', 'đối tác'], // i18n-data
    partner_code: ['mã đối tác'], // i18n-data
    department: ['bộ phận', 'phòng ban'], // i18n-data
    value: ['giá trị', 'giá trị hợp đồng'], // i18n-data
    currency: ['loại tiền', 'tiền tệ'], // i18n-data
    signed_date: ['ngày ký'], // i18n-data
    start_date: ['ngày hiệu lực', 'ngày bắt đầu'], // i18n-data
    end_date: ['ngày hết hạn'], // i18n-data
    status: ['trạng thái'], // i18n-data
    storage_location: ['nơi lưu trữ'], // i18n-data
    notes: ['ghi chú'], // i18n-data
    renewal_terms: ['điều khoản gia hạn'], // i18n-data
  },
};

/** "Ngày ký (YYYY-MM-DD) *" → "ngày ký" */ // i18n-data
export function normalizeHeader(header: string): string {
  return String(header ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[*:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DOC_TYPES: Record<string, string> = {
  incoming: 'incoming', 'văn bản đến': 'incoming', 'đến': 'incoming', 'công văn đến': 'incoming', // i18n-data
  outgoing: 'outgoing', 'văn bản đi': 'outgoing', 'đi': 'outgoing', 'công văn đi': 'outgoing', // i18n-data
  internal: 'internal', 'nội bộ': 'internal', 'văn bản nội bộ': 'internal', // i18n-data
  decision: 'decision', 'quyết định': 'decision', // i18n-data
};

/** "1.000.000" / "1,000,000" / "1.000,5" / "1500.75" / "12 000" → number (NaN if not a number) */
export function parseAmount(text: string): number {
  const t = text.replace(/[\s\u00A0]/g, '').replace(/[^\d.,-]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return Number(t.replace(/,/g, ''));
  if (/^-?\d+,\d+$/.test(t)) return Number(t.replace(',', '.'));
  return t ? Number(t) : NaN;
}

function fieldFor(kind: ImportRowKind, header: string): string | null {
  const h = normalizeHeader(header);
  for (const [field, names] of Object.entries(ALIASES[kind])) {
    if (h === field || names.includes(h)) return field;
  }
  return null;
}

export interface ParsedImport {
  rows: Array<Record<string, any>>;
  errors: Array<{ row: number; error: string }>;
  newCount: number;
  updateCount: number;
}

export function parseImportRows(kind: ImportRowKind, rawRows: Array<Record<string, unknown>>, missingNumberMessage: string): ParsedImport {
  const out: ParsedImport = { rows: [], errors: [], newCount: 0, updateCount: 0 };
  const numberField = kind === 'document' ? 'document_number' : 'contract_number';
  rawRows.forEach((raw, idx) => {
    const row: Record<string, any> = {};
    for (const [header, cell] of Object.entries(raw ?? {})) {
      if (cell === null || cell === undefined) continue;
      const text = typeof cell === 'string' ? cell.trim() : cell;
      if (text === '' || text === 'null') continue;
      const field = fieldFor(kind, header);
      if (!field) {
        row[String(header).trim()] = text; // extension column: kept as is
        continue;
      }
      if (field === 'value') {
        const n = typeof text === 'number' ? text : parseAmount(String(text));
        if (Number.isFinite(n)) row.value = n;
        else row.value = text; // invalid: the server reports it
      } else if (field === 'doc_type') {
        const t = String(text).normalize('NFC').toLowerCase().trim();
        row.doc_type = DOC_TYPES[t] ?? String(text);
      } else {
        row[field] = typeof text === 'string' ? text : String(text);
      }
    }
    if (!row[numberField] && !row.id) {
      out.errors.push({ row: idx + 2, error: missingNumberMessage });
      return;
    }
    if (row.id) out.updateCount++;
    else out.newCount++;
    out.rows.push(row);
  });
  return out;
}
