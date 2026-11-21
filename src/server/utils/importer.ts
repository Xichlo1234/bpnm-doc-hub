import { store, diffRecords } from '../db/store.ts';
import { documentInput, contractInput, withoutUnchangedLinks } from './validation.ts';
import type { SqlDatabase, SqlStatement } from '../db/database.ts';
import { normalizeNumber, numberScope } from './numberKeys.ts';
import { workflowKind, findStage, isIssued, ISSUED_PROTECTED_FIELDS } from './workflow.ts';

// Excel import in two steps: preview (validate every row, find duplicates, show what would be added or
// updated and which fields change) and commit (requires the caller to confirm updates explicitly, so
// existing records are never overwritten silently).

export type ImportKind = 'document' | 'contract';

export interface PreviewRow {
  index: number; // 0-based row in the uploaded list
  key: string;
  action: 'create' | 'update' | 'unchanged' | 'duplicate_in_file' | 'error';
  id?: string;
  changes?: Record<string, [unknown, unknown]>;
  errors?: string[];
  data?: Record<string, any>;
}

export interface ImportPreview {
  rows: PreviewRow[];
  summary: { total: number; create: number; update: number; unchanged: number; duplicate_in_file: number; error: number };
}

const numberField = (kind: ImportKind) => (kind === 'document' ? 'document_number' : 'contract_number');
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const IGNORED = new Set(['id', 'created_at', 'updated_at', 'revision', 'deadline_status', 'urgency']);

const CONTRACT_STATUSES = new Set(['active', 'liquidated', 'terminated']);

/**
 * What an Excel import may not do, because other rules govern it: change a record's number, move a
 * document through its workflow, change a security level, edit an issued document, reuse a number
 * that belongs to a record in the trash.
 */
function importRuleErrors(kind: ImportKind, data: Record<string, any>, match: any | null): string[] {
  const errors: string[] = [];
  const numField = numberField(kind);
  if (!match) {
    const scopeData = kind === 'document' ? { doc_type: data.doc_type ?? 'incoming' } : {};
    const n = normalizeNumber(data[numField]);
    const trashed = (kind === 'document' ? store.getTrash().documents : store.getTrash().contracts).find(
      (r: any) => normalizeNumber(r[numField]) === n && (kind === 'contract' || numberScope('document', r) === numberScope('document', scopeData))
    );
    if (trashed) errors.push(`${numField}: số đã thuộc hồ sơ trong thùng rác (không cấp lại)`);
    if (kind === 'document') {
      const wk = workflowKind(data.doc_type ?? 'incoming');
      if (wk && data.status && !findStage(wk, data.status)) errors.push(`status: "${data.status}" không thuộc quy trình`);
    } else if (data.status && !CONTRACT_STATUSES.has(String(data.status))) {
      errors.push(`status: "${data.status}" không hợp lệ (active / liquidated / terminated)`);
    }
    return errors;
  }
  if (data[numField] !== undefined && normalizeNumber(data[numField]) !== normalizeNumber(match[numField])) {
    errors.push(`${numField}: không đổi số hồ sơ qua nhập Excel`);
  }
  if (kind === 'document') {
    if (data.doc_type !== undefined && data.doc_type !== match.doc_type) errors.push('doc_type: không đổi loại văn bản qua nhập Excel');
    const wk = workflowKind(match.doc_type);
    if (wk && data.status !== undefined && findStage(wk, data.status)?.code !== findStage(wk, match.status)?.code) {
      errors.push('status: đổi trạng thái theo quy trình, không qua nhập Excel');
    }
    if (data.security_level !== undefined && norm(data.security_level) !== norm(match.security_level)) {
      errors.push('security_level: không đổi độ mật qua nhập Excel');
    }
    if (isIssued(match)) {
      const touched = ISSUED_PROTECTED_FIELDS.filter((f) => data[f] !== undefined && norm(data[f]) !== norm(match[f]));
      if (touched.length > 0) errors.push(`${touched.join(', ')}: văn bản đã phát hành, điều chỉnh bằng form sửa (cần lý do)`);
    }
  } else if (data.status !== undefined && (data.status || 'active') !== (match.status || 'active')) {
    errors.push('status: thanh lý / chấm dứt bằng chức năng tương ứng, không qua nhập Excel');
  }
  return errors;
}

export function previewImport(kind: ImportKind, rawRows: unknown[]): ImportPreview {
  const field = numberField(kind);
  const existing = kind === 'document' ? store.getDocuments() : store.getContracts();
  const byNumber = new Map(existing.map((r: any) => [norm(r[field]), r]));
  const byId = new Map(existing.map((r: any) => [r.id, r]));
  const schema = (kind === 'document' ? documentInput : contractInput).bulk.element;
  const seen = new Set<string>();

  const rows: PreviewRow[] = rawRows.map((raw: any, index) => {
    const key = String(raw?.[field] ?? raw?.id ?? '').trim();
    const match = (raw?.id && byId.get(raw.id)) || byNumber.get(norm(raw?.[field])) || null;
    const parsed = schema.safeParse(withoutUnchangedLinks(raw, match));
    if (!parsed.success) {
      return { index, key, action: 'error', errors: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '-'}: ${i.message}`) };
    }
    const data = parsed.data as Record<string, any>;
    if (!key) return { index, key, action: 'error', errors: [`${field}: bắt buộc`] };
    const dedupeKey = `${kind === 'document' ? numberScope('document', { doc_type: data.doc_type ?? match?.doc_type }) : 'contract'}|${normalizeNumber(key)}`;
    if (seen.has(dedupeKey)) return { index, key, action: 'duplicate_in_file' };
    seen.add(dedupeKey);
    const ruleErrors = importRuleErrors(kind, data, match);
    if (ruleErrors.length > 0) return { index, key, action: 'error', errors: ruleErrors };
    if (!match) return { index, key, action: 'create', data };
    const changes = diffRecords(
      Object.fromEntries(Object.keys(data).filter((k) => !IGNORED.has(k)).map((k) => [k, (match as any)[k] ?? null])),
      Object.fromEntries(Object.entries(data).filter(([k]) => !IGNORED.has(k)))
    );
    return Object.keys(changes).length === 0
      ? { index, key, action: 'unchanged', id: match.id }
      : { index, key, action: 'update', id: match.id, changes, data };
  });

  const summary = { total: rows.length, create: 0, update: 0, unchanged: 0, duplicate_in_file: 0, error: 0 };
  for (const r of rows) summary[r.action]++;
  return { rows, summary };
}

/** Rows to write: new records plus, only when confirmed, updates. */
export function rowsToCommit(preview: ImportPreview): Array<Record<string, any>> {
  return preview.rows
    .filter((r) => r.action === 'create' || r.action === 'update')
    .map((r) => (r.action === 'update' ? { ...r.data, id: r.id } : r.data!));
}

/** The import_batches row, written in the same D1 batch as the imported records (see store.queueStatement). */
export function importBatchStatement(
  db: SqlDatabase,
  entry: { kind: ImportKind; fileName?: string | null; user: { id: string; name?: string; username?: string }; added: number; updated: number; skipped: number; details?: unknown }
): SqlStatement {
  return db
    .prepare(
      'INSERT INTO import_batches (id, entity_type, file_name, imported_by, imported_by_name, imported_at, added, updated, skipped, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      entry.kind,
      entry.fileName ?? null,
      entry.user.id,
      entry.user.name || entry.user.username || null,
      new Date().toISOString(),
      entry.added,
      entry.updated,
      entry.skipped,
      entry.details ? JSON.stringify(entry.details) : null
    );
}

export async function listImportBatches(db: SqlDatabase, limit = 100) {
  const { results } = await db.prepare('SELECT * FROM import_batches ORDER BY imported_at DESC LIMIT ?').bind(limit).all<any>();
  return results.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}
