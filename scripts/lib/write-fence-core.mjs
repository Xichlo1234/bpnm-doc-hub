// Write fence for the maintenance window (docs/ops/DEPLOY_RUNBOOK.md).
//
// Deploying a new Worker version does not stop requests that are already running on the old version,
// and a timer is no proof that they finished. The fence makes D1 itself refuse every INSERT/UPDATE/
// DELETE on the tables the pre-0004 build writes: any batch an old Worker still sends aborts as a whole
// (D1 batches are transactions), so nothing it does can land after the fence is installed.
//
// Migrations 0004–0011 only CREATE tables/indexes, ALTER TABLE ADD COLUMN and update new tables
// (file_uploads), so they run with the fence in place. The fence is removed before writes are opened.

export const FENCED_TABLES = [
  'documents', 'contracts', 'partners', 'users', 'notifications', 'audit_logs', 'app_config', 'meta',
  'uploaded_files', 'file_chunks', 'system_data', 'auth_revoked_sessions', 'auth_login_failures',
];
export const FENCE_PREFIX = 'write_fence_';
export const FENCE_MESSAGE = 'WRITE_FENCE: maintenance in progress';
const OPS = ['INSERT', 'UPDATE', 'DELETE'];

/** Statements that install the fence on the given (existing) tables. Idempotent. */
export function fenceOnSql(existingTables) {
  const tables = FENCED_TABLES.filter((t) => existingTables.includes(t));
  return tables.flatMap((t) =>
    OPS.map((op) => `CREATE TRIGGER IF NOT EXISTS ${FENCE_PREFIX}${t}_${op.toLowerCase()} BEFORE ${op} ON ${t} BEGIN SELECT RAISE(ABORT, '${FENCE_MESSAGE}'); END;`)
  );
}

/** Statements that remove the fence (every trigger it may have created). Idempotent. */
export function fenceOffSql() {
  return FENCED_TABLES.flatMap((t) => OPS.map((op) => `DROP TRIGGER IF EXISTS ${FENCE_PREFIX}${t}_${op.toLowerCase()};`));
}

export const FENCE_STATUS_SQL = `SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '${FENCE_PREFIX}%' ORDER BY name`;
export const TABLES_SQL = "SELECT name FROM sqlite_master WHERE type = 'table'";
