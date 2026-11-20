import { Hono } from 'hono';
import * as fs from 'fs';
import { requireAdmin } from './auth.ts';
import { getDatabase } from '../db/database.ts';
import { UPLOADS_DIR } from '../utils/fileStorage.ts';
import { referencedFileKeys } from '../utils/attachments.ts';

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

  const referenced = [...referencedFileKeys()].filter((k) => k.startsWith('uploads/'));
  const referencedSet = new Set(referenced);
  const missing = referenced.filter((k) => !storedKeys.has(k) && !legacyD1Keys.has(k));

  const now = Date.now();
  const orphans = stored
    .filter((o) => !referencedSet.has(o.key))
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
    ok: missing.length === 0 && orphans.length === 0,
  });
});
