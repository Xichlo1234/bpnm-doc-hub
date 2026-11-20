import { store, diffRecords } from '../db/store.ts';
import { documentInput, contractInput, withoutUnchangedLinks } from './validation.ts';
import type { SqlDatabase } from '../db/database.ts';

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
    const dedupeKey = norm(key);
    if (seen.has(dedupeKey)) return { index, key, action: 'duplicate_in_file' };
    seen.add(dedupeKey);
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

export async function logImportBatch(
  db: SqlDatabase,
  entry: { kind: ImportKind; fileName?: string | null; user: { id: string; name?: string; username?: string }; added: number; updated: number; skipped: number; details?: unknown }
) {
  await db
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
    )
    .run();
}

export async function listImportBatches(db: SqlDatabase, limit = 100) {
  const { results } = await db.prepare('SELECT * FROM import_batches ORDER BY imported_at DESC LIMIT ?').bind(limit).all<any>();
  return results.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
}
