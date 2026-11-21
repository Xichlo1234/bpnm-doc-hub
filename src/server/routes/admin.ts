import { Hono } from 'hono';
import * as fs from 'fs';
import { requireAdmin } from './auth.ts';
import { getDatabase } from '../db/database.ts';
import { UPLOADS_DIR } from '../utils/fileStorage.ts';
import { referencedFileKeys } from '../utils/attachments.ts';
import { processCleanup, listCleanup, cleanupCounts, type CleanupStatus } from '../utils/storageCleanup.ts';
import { getAuthUser } from './auth.ts';
import { store } from '../db/store.ts';
import { numberRegisterStatements } from '../db/repository.ts';

export const adminRouter = new Hono();
adminRouter.use('*', requireAdmin);

// Uploads younger than this may still be waiting for their record to be saved
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

interface StoredObject {
  key: string;
  size: number;
  uploaded?: string;
}

async function listStoredObjects(env: any): Promise<StoredObject[]> {
  if (env?.BUCKET) {
    const objects: StoredObject[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.BUCKET.list({ prefix: 'uploads/', cursor, limit: 1000 });
      for (const o of page.objects) objects.push({ key: o.key, size: o.size, uploaded: o.uploaded?.toISOString?.() });
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return objects;
  }
  try {
    return fs.readdirSync(UPLOADS_DIR).map((name) => {
      const st = fs.statSync(`${UPLOADS_DIR}/${name}`);
      return { key: `uploads/${name}`, size: st.size, uploaded: st.mtime.toISOString() };
    });
  } catch {
    return [];
  }
}

/**
 * GET /api/admin/storage-check — read-only reconciliation of D1 and R2:
 *  - missing: file keys referenced by a record/attachment that are in neither R2 nor legacy D1 storage
 *  - orphans: objects in R2 that no record, attachment or recent upload refers to
 * Nothing is deleted; orphans are listed for an admin to review.
 */
adminRouter.get('/storage-check', async (c) => {
  const db = await getDatabase(c.env);
  const env = c.env as any;
  const stored = await listStoredObjects(env);
  const storedKeys = new Set(stored.map((o) => o.key));

  let legacyD1Keys = new Set<string>();
  try {
    const { results } = await db.prepare('SELECT key FROM uploaded_files').all<{ key: string }>();
    legacyD1Keys = new Set(results.map((r) => r.key));
  } catch {
    // table absent on fresh databases
  }
  const { results: uploads } = await db.prepare('SELECT key, uploaded_by, original_name, created_at FROM file_uploads').all<any>();
  const uploadByKey = new Map(uploads.map((u: any) => [u.key, u]));

  const { results: retiredRows } = await db.prepare("SELECT key FROM storage_cleanup WHERE status IN ('pending', 'deleted')").all<{ key: string }>();
  const retired = new Set(retiredRows.map((r) => r.key));
  const cleanup = await cleanupCounts(db);
  const pendingSample = await listCleanup(db, 'pending', 100, 0);
  const referenced = [...referencedFileKeys()].filter((k) => k.startsWith('uploads/'));
  const referencedSet = new Set(referenced);
  const missing = referenced.filter((k) => !storedKeys.has(k) && !legacyD1Keys.has(k));

  const now = Date.now();
  const orphans = stored
    .filter((o) => !referencedSet.has(o.key) && !retired.has(o.key))
    .map((o) => ({ ...o, registration: uploadByKey.get(o.key) ?? null }))
    .filter((o) => {
      const at = Date.parse(o.registration?.created_at || o.uploaded || '');
      return !Number.isFinite(at) || now - at > ORPHAN_GRACE_MS;
    });

  return c.json({
    checked_at: new Date().toISOString(),
    storage: env?.BUCKET ? 'r2' : 'local',
    stored_objects: stored.length,
    referenced_files: referenced.length,
    missing,
    orphans,
    cleanup,
    cleanup_pending: pendingSample,
    ok: missing.length === 0 && orphans.length === 0 && cleanup.pending === 0,
  });
});

// GET /api/admin/storage-cleanup?status=pending&limit=100&offset=0 — the backlog, paged, with totals
adminRouter.get('/storage-cleanup', async (c) => {
  const db = await getDatabase(c.env);
  const raw = c.req.query('status');
  const status = raw === 'pending' || raw === 'deleted' || raw === 'kept' ? (raw as CleanupStatus) : undefined;
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);
  return c.json({ counts: await cleanupCounts(db), limit, offset, rows: await listCleanup(db, status, limit, offset) });
});

// POST /api/admin/storage-cleanup — retries pending deletions (re-checking references first)
adminRouter.post('/storage-cleanup', async (c) => {
  const db = await getDatabase(c.env);
  const processed = await processCleanup(db, c.env);
  const result = { ...processed, remaining: await cleanupCounts(db) };
  const user = getAuthUser(c)!;
  if (result.deleted.length + result.kept.length + result.failed.length > 0) {
    store.recordAuditLog({
      user_id: user.id,
      username: user.username,
      action: 'delete',
      entity_type: 'category',
      details: `Dọn kho tệp: xoá ${result.deleted.length}, giữ lại ${result.kept.length}, lỗi ${result.failed.length}`,
    });
    await store.persistAsync();
  }
  return c.json(result);
});

/**
 * POST /api/admin/number-registry/reconcile[?apply=1] — after a period in which records may have been
 * written without registering their numbers (e.g. a rollback to an older build), lists the numbers
 * of live and trashed records missing from number_registry and the ones registered to another
 * record. With apply=1 the missing ones are registered (INSERT OR IGNORE). Nothing is ever deleted
 * or re-assigned: conflicts are only reported for manual review.
 */
adminRouter.post('/number-registry/reconcile', async (c) => {
  const db = await getDatabase(c.env);
  const apply = c.req.query('apply') === '1';
  const report = store.numberRegistryReport();
  if (apply && report.missing.length > 0) {
    await db.batch(numberRegisterStatements(db, report.missing));
    store.markNumbersRegistered(report.missing);
    const user = getAuthUser(c)!;
    store.recordAuditLog({
      user_id: user.id,
      username: user.username,
      action: 'update',
      entity_type: 'category',
      details: `Đối soát sổ số: đăng ký bổ sung ${report.missing.length} số, ${report.conflicts.length} số trùng cần rà soát`,
    });
    await store.persistAsync();
  }
  return c.json({
    applied: apply,
    missing: report.missing.map((e) => ({ scope: e.scope, number: e.display, record_type: e.recordType, record_id: e.recordId })),
    conflicts: report.conflicts,
  });
});
