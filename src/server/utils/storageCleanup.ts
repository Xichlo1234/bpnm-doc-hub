// Two-phase deletion of stored objects (migration 0009: storage_cleanup).
//
// Phase 1 (inside the D1 batch that purges a record): the keys the record held are enqueued as
//   'pending'. From that moment the key is a tombstone: no one (not even an admin) can attach it
//   again (file_guard in the write batch), and non-admins can never read it.
// Phase 2 (after the commit, and again from POST /api/admin/storage-cleanup): for each pending key
//   the *database* is asked whether any record or attachment row still references it. Referenced →
//   'kept' (object left in place). Otherwise the object is deleted → 'deleted'. A failed deletion
//   stays 'pending' with attempts/last_error and is retried later; the tombstone keeps protecting it.

import type { SqlDatabase, SqlStatement } from '../db/database.ts';
import { deleteStoredFile } from './fileStorage.ts';

export type CleanupStatus = 'pending' | 'deleted' | 'kept';

export interface CleanupRow {
  key: string;
  status: CleanupStatus;
  reason: string | null;
  enqueued_at: string;
  enqueued_by: string | null;
  attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
  done_at: string | null;
}

/** Enqueue (or re-arm a previously 'kept' key) — goes into the same batch as the purge. */
export function enqueueCleanupStatement(db: SqlDatabase, key: string, reason: string, userId: string): SqlStatement {
  return db
    .prepare(
      `INSERT INTO storage_cleanup (key, status, reason, enqueued_at, enqueued_by, attempts)
       VALUES (?, 'pending', ?, ?, ?, 0)
       ON CONFLICT(key) DO UPDATE SET status = 'pending', reason = excluded.reason, enqueued_at = excluded.enqueued_at,
         enqueued_by = excluded.enqueued_by WHERE storage_cleanup.status = 'kept'`
    )
    .bind(key, reason, new Date().toISOString(), userId);
}

export async function getCleanupRow(db: SqlDatabase, key: string): Promise<CleanupRow | null> {
  return (await db.prepare('SELECT * FROM storage_cleanup WHERE key = ?').bind(key).first<CleanupRow>()) ?? null;
}

/** True while a key is queued for deletion or deleted: it is retired for good. */
export async function isRetired(db: SqlDatabase, key: string): Promise<boolean> {
  const row = await getCleanupRow(db, key);
  return row?.status === 'pending' || row?.status === 'deleted';
}

/** Retire only an unattached upload. The tombstone and the attach guard order cleanup
 * against a D1 batch whose commit response was lost. If D1 is unavailable, keep the object. */
export async function discardUpload(db: SqlDatabase, key: string, env: any): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO storage_cleanup (key, status, reason, enqueued_at)
       SELECT ?1, 'pending', 'upload_rollback', ?2
       WHERE NOT EXISTS (SELECT 1 FROM file_uploads WHERE key = ?1 AND attached_at IS NOT NULL)
       ON CONFLICT(key) DO NOTHING`
    ).bind(key, new Date().toISOString()).run();
    await processCleanup(db, env, [key]);
  } catch (error) {
    console.warn('Upload rollback deferred', error);
  }
}

async function stillReferenced(db: SqlDatabase, key: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS x FROM documents WHERE file_key = ?1
       UNION ALL SELECT 1 FROM contracts WHERE file_key = ?1
       UNION ALL SELECT 1 FROM attachments WHERE file_key = ?1
       LIMIT 1`
    )
    .bind(key)
    .first();
  return Boolean(row);
}

/**
 * Processes pending keys (all, or the given ones). Never deletes an object the database still
 * references; never throws — failures are recorded on the row and retried later.
 */
export async function processCleanup(
  db: SqlDatabase,
  env: any,
  keys?: string[],
  remove: (key: string, env: any) => Promise<void> = deleteStoredFile
): Promise<{ deleted: string[]; kept: string[]; failed: Array<{ key: string; error: string }> }> {
  const result = { deleted: [] as string[], kept: [] as string[], failed: [] as Array<{ key: string; error: string }> };
  const rows = keys
    ? (await Promise.all(keys.map((k) => getCleanupRow(db, k)))).filter((r): r is CleanupRow => r?.status === 'pending')
    : (await db.prepare("SELECT * FROM storage_cleanup WHERE status = 'pending' ORDER BY enqueued_at LIMIT 200").all<CleanupRow>()).results;
  for (const row of rows) {
    const now = new Date().toISOString();
    try {
      if (await stillReferenced(db, row.key)) {
        await db.prepare("UPDATE storage_cleanup SET status = 'kept', last_attempt_at = ?, done_at = ? WHERE key = ? AND status = 'pending'").bind(now, now, row.key).run();
        result.kept.push(row.key);
        continue;
      }
      await remove(row.key, env);
      const saved = db.prepare(
        "UPDATE storage_cleanup SET status = 'deleted', attempts = attempts + 1, last_error = NULL, last_attempt_at = ?, done_at = ? WHERE key = ? AND status = 'pending'",
      ).bind(now, now, row.key);
      if (row.reason === 'upload_rollback') {
        await db.batch([saved, db.prepare('DELETE FROM file_uploads WHERE key = ? AND attached_at IS NULL').bind(row.key)]);
      } else {
        await saved.run();
      }
      result.deleted.push(row.key);
    } catch (err) {
      const message = String((err as Error)?.message || err).slice(0, 500);
      await db
        .prepare('UPDATE storage_cleanup SET attempts = attempts + 1, last_error = ?, last_attempt_at = ? WHERE key = ?')
        .bind(message, now, row.key)
        .run()
        .catch(() => {});
      result.failed.push({ key: row.key, error: message });
    }
  }
  return result;
}

export async function listCleanup(db: SqlDatabase, status?: CleanupStatus, limit = 500, offset = 0): Promise<CleanupRow[]> {
  const stmt = status
    ? db.prepare('SELECT * FROM storage_cleanup WHERE status = ? ORDER BY enqueued_at DESC, key LIMIT ? OFFSET ?').bind(status, limit, offset)
    : db.prepare('SELECT * FROM storage_cleanup ORDER BY enqueued_at DESC, key LIMIT ? OFFSET ?').bind(limit, offset);
  return (await stmt.all<CleanupRow>()).results;
}

/** Backlog size per status (the whole table, not one page). */
export async function cleanupCounts(db: SqlDatabase): Promise<Record<CleanupStatus, number> & { failing: number }> {
  const { results } = await db.prepare('SELECT status, COUNT(*) AS n, SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS failing FROM storage_cleanup GROUP BY status').all<any>();
  const counts = { pending: 0, deleted: 0, kept: 0, failing: 0 } as Record<CleanupStatus, number> & { failing: number };
  for (const r of results) {
    counts[r.status as CleanupStatus] = Number(r.n);
    if (r.status === 'pending') counts.failing = Number(r.failing || 0);
  }
  return counts;
}
