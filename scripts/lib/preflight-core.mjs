import { partnerCodeKey } from '../../src/shared/partnerCodeKey.mjs';
import { FENCE_STATUS_SQL } from './write-fence-core.mjs';
// Read-only pre-deployment checks for the D1 database (see scripts/preflight.mjs).
// `query(sql)` must return an array of row objects. Only SELECT / PRAGMA statements are issued.

const READ_ONLY = /^\s*(SELECT|PRAGMA)\b/i;

export const BASE_TABLES = ['documents', 'contracts', 'partners', 'users', 'notifications', 'audit_logs', 'app_config', 'meta'];
export const EXPECTED_AFTER = {
  '0004_file_uploads.sql': { tables: ['file_uploads'] },
  '0005_access_columns.sql': { columns: { users: ['can_access_confidential_documents'], notifications: ['recipient_user_id'] } },
  '0006_attachments_trash_history.sql': {
    tables: ['attachments', 'record_history'],
    columns: { documents: ['deleted_at', 'deleted_by'], contracts: ['deleted_at', 'deleted_by'], partners: ['deleted_at', 'deleted_by'] },
  },
  '0007_numbering_imports_guard.sql': { tables: ['number_sequences', 'import_batches', 'write_guard'] },
  '0008_number_registry.sql': { tables: ['number_registry', 'number_guard'] },
  '0009_final_hardening.sql': {
    tables: ['storage_cleanup', 'file_guard'],
    columns: { partners: ['revision'], users: ['revision'], attachments: ['revision'], file_uploads: ['attached_at'] },
  },
  '0010_partner_code_unique.sql': {},
  '0011_partner_code_key.sql': { columns: { partners: ['code_key'] } },
};

const normalizeNumber = (v) => String(v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

export async function runPreflight(query, migrationFiles) {
  const q = async (sql) => {
    if (!READ_ONLY.test(sql)) throw new Error(`preflight refuses a non read-only statement: ${sql}`);
    return query(sql);
  };
  const report = { blocking: [], warnings: [], info: {} };
  // Write fence (maintenance window): writes are refused while it is installed
  try {
    const fence = await q(FENCE_STATUS_SQL);
    report.info.write_fence_triggers = fence.length;
    if (fence.length) report.warnings.push(`Rào chắn ghi đang bật (${fence.length} trigger): mọi ghi bị D1 từ chối. Gỡ bằng scripts/write-fence.mjs off trước khi mở ghi.`);
  } catch {
    report.info.write_fence_triggers = null;
  }

  const tables = new Set((await q("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name));
  const columns = async (table) => (tables.has(table) ? (await q(`PRAGMA table_info(${table})`)).map((c) => c.name) : []);

  // 1. Migration ledger
  const applied = tables.has('d1_migrations') ? (await q('SELECT name FROM d1_migrations ORDER BY id')).map((r) => r.name) : [];
  const pending = migrationFiles.filter((f) => !applied.includes(f));
  report.info.applied_migrations = applied;
  report.info.pending_migrations = pending;
  for (const base of ['0001_normalized_tables.sql', '0002_auth_state.sql', '0003_record_revisions.sql']) {
    if (!applied.includes(base)) report.blocking.push(`Migration ${base} chưa được áp dụng (bắt buộc trước 0004+).`);
  }
  const unknown = applied.filter((f) => !migrationFiles.includes(f));
  if (unknown.length) report.blocking.push(`Ledger có migration không có trong mã nguồn: ${unknown.join(', ')}`);

  // 2. Schema matches the ledger
  for (const t of BASE_TABLES) if (!tables.has(t)) report.blocking.push(`Thiếu bảng ${t}.`);
  for (const [file, exp] of Object.entries(EXPECTED_AFTER)) {
    const isApplied = applied.includes(file);
    for (const t of exp.tables || []) {
      if (isApplied && !tables.has(t)) report.blocking.push(`${file} đã ghi nhận nhưng thiếu bảng ${t}.`);
      if (!isApplied && tables.has(t)) report.warnings.push(`Bảng ${t} đã tồn tại dù ${file} chưa ghi nhận (CREATE IF NOT EXISTS vẫn an toàn).`);
    }
    for (const [t, cols] of Object.entries(exp.columns || {})) {
      const have = await columns(t);
      for (const col of cols) {
        if (isApplied && !have.includes(col)) report.blocking.push(`${file} đã ghi nhận nhưng thiếu cột ${t}.${col}.`);
        // ALTER TABLE ADD COLUMN would fail on an existing column: that blocks the migration
        if (!isApplied && have.includes(col)) report.blocking.push(`Cột ${t}.${col} đã tồn tại nhưng ${file} chưa ghi nhận: migration sẽ lỗi.`);
      }
    }
  }
  if (report.blocking.some((b) => b.startsWith('Thiếu bảng'))) return report;

  // 3. Data conditions
  const legacyImport = await q("SELECT value FROM meta WHERE key = 'legacy_import'");
  if (!legacyImport.length) report.warnings.push('Chưa có meta.legacy_import: lần khởi động đầu sẽ nhập dữ liệu cũ/seed.');

  const count = async (sql) => Number((await q(sql))[0]?.n ?? 0);
  report.info.records = {
    documents: await count('SELECT COUNT(*) AS n FROM documents'),
    contracts: await count('SELECT COUNT(*) AS n FROM contracts'),
    partners: await count('SELECT COUNT(*) AS n FROM partners'),
    users: await count('SELECT COUNT(*) AS n FROM users'),
    notifications: await count('SELECT COUNT(*) AS n FROM notifications'),
  };
  report.info.null_revision = {
    documents: await count('SELECT COUNT(*) AS n FROM documents WHERE revision IS NULL'),
    contracts: await count('SELECT COUNT(*) AS n FROM contracts WHERE revision IS NULL'),
  };
  report.info.contracts_without_status = await count("SELECT COUNT(*) AS n FROM contracts WHERE status IS NULL OR trim(status) = ''");
  if ((await columns('notifications')).includes('recipient_user_id')) {
    report.info.notifications_without_recipient = await count('SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id IS NULL');
  } else {
    report.info.notifications_without_recipient = report.info.records.notifications;
  }
  const keyRows = await q("SELECT file_key FROM documents WHERE file_key IS NOT NULL AND file_key <> '' UNION ALL SELECT file_key FROM contracts WHERE file_key IS NOT NULL AND file_key <> ''");
  report.info.legacy_file_keys = keyRows.filter((r) => !/^(uploads|samples)\/[^/\\]+$/.test(r.file_key) && !/^https?:\/\//i.test(r.file_key)).length;
  report.info.uploads_keys = keyRows.filter((r) => /^uploads\//.test(r.file_key)).length;
  if (tables.has('uploaded_files')) report.info.legacy_d1_files = await count('SELECT COUNT(*) AS n FROM uploaded_files');
  if (tables.has('storage_cleanup')) {
    report.info.storage_cleanup_pending = await count("SELECT COUNT(*) AS n FROM storage_cleanup WHERE status = 'pending'");
    if (report.info.storage_cleanup_pending > 0) report.warnings.push(`${report.info.storage_cleanup_pending} tệp chờ xoá trên R2 (chạy POST /api/admin/storage-cleanup).`);
  }

  // Usernames must be unique case-insensitively before 0009 adds the unique index
  const usernames = await q('SELECT id, username FROM users');
  const byName = new Map();
  for (const u of usernames) {
    const k = String(u.username || '').toLowerCase();
    byName.set(k, [...(byName.get(k) || []), u.id]);
  }
  const dupUsers = [...byName.entries()].filter(([, ids]) => ids.length > 1);
  report.info.duplicate_usernames = dupUsers.map(([name, ids]) => ({ username: name, ids }));
  if (dupUsers.length && !applied.includes('0009_final_hardening.sql')) {
    report.blocking.push(`${dupUsers.length} tên đăng nhập trùng (không phân biệt hoa thường): migration 0009 sẽ lỗi. Đổi tên tài khoản trùng trước khi migrate.`);
  }

  // Active partner codes must be unique before 0010 adds the unique index
  const partnerCols = await columns('partners');
  const partners = await q(`SELECT id, code${partnerCols.includes('deleted_at') ? ', deleted_at' : ''}${partnerCols.includes('code_key') ? ', code_key' : ''} FROM partners`);
  const byCode = new Map();
  for (const p of partners) {
    if (p.deleted_at) continue;
    const k = partnerCodeKey(p.code);
    if (!k) continue;
    byCode.set(k, [...(byCode.get(k) || []), p.id]);
  }
  const dupPartners = [...byCode.entries()].filter(([, ids]) => ids.length > 1);
  report.info.duplicate_partner_codes = dupPartners.map(([code, ids]) => ({ code, ids }));
  if (dupPartners.length) {
    // Same key as the application and partners.code_key (0011): case, spaces and Unicode form ignored.
    // Never resolved automatically: the owner decides which code to change or which partner to trash.
    report.blocking.push(
      `${dupPartners.length} nhóm mã đối tác trùng giữa các đối tác đang hoạt động (không phân biệt hoa/thường, khoảng trắng, dạng Unicode): ` +
        `${dupPartners.map(([k, ids]) => `${k} → ${ids.join(', ')}`).join('; ')}. ` +
        (applied.includes('0010_partner_code_unique.sql') ? '' : 'Migration 0010 có thể lỗi. ') +
        'Chủ dự án quyết định đổi mã hoặc chuyển một đối tác vào thùng rác; migration và ứng dụng không tự sửa.'
    );
  }
  if (partnerCols.includes('code_key')) {
    const missing = partners.filter((p) => !p.deleted_at && p.code && !p.code_key).length;
    report.info.partner_code_key_missing = missing;
    if (missing) report.warnings.push(`${missing} đối tác chưa có code_key (ứng dụng tự điền khi khởi động, trừ mã trùng).`);
  }

  // 4. Duplicate business numbers (same normalisation as the app / number_registry)
  const dup = (rows, scopeOf, numOf) => {
    const m = new Map();
    for (const r of rows) {
      const n = normalizeNumber(numOf(r));
      if (!n) continue;
      const k = `${scopeOf(r)}|${n}`;
      m.set(k, [...(m.get(k) || []), r.id]);
    }
    return [...m.entries()].filter(([, ids]) => ids.length > 1).map(([k, ids]) => ({ key: k, ids }));
  };
  const docs = await q('SELECT id, doc_type, document_number FROM documents');
  const cons = await q('SELECT id, contract_number FROM contracts');
  const duplicates = [
    ...dup(docs, (r) => `doc:${r.doc_type || 'other'}`, (r) => r.document_number),
    ...dup(cons, () => 'contract', (r) => r.contract_number),
  ];
  report.info.duplicate_numbers = duplicates;
  if (duplicates.length) {
    report.warnings.push(
      `${duplicates.length} số nghiệp vụ bị trùng trong dữ liệu lịch sử. Migration 0008 KHÔNG sửa/xoá các hồ sơ này: ` +
        'hồ sơ cũ nhất giữ số, các hồ sơ còn lại vẫn đọc/sửa được nhưng không thể đổi sang số đã có. Rà soát và đánh lại số thủ công nếu cần.'
    );
  }
  if (tables.has('number_registry')) {
    // Classify number_registry state:
    //  - historical duplicates recorded by the one-time backfill → warning (known, records editable)
    //  - a number registered to record X but now also carried by another record Y that is not one of
    //    those historical duplicates → BLOCKING (a duplicate was created after the registry existed,
    //    e.g. by an older build after a rollback)
    //  - a number nobody registered and nobody else holds → warning (reconcile can register it)
    const reg = new Map((await q('SELECT scope, number_norm, record_id FROM number_registry')).map((r) => [`${r.scope}|${r.number_norm}`, r.record_id]));
    const backfillRow = (await q("SELECT value FROM meta WHERE key = 'number_registry_backfill'"))[0]?.value ?? null;
    const backfilled = backfillRow !== null;
    const known = new Set();
    if (backfillRow) {
      try {
        for (const d of JSON.parse(backfillRow).duplicates || []) for (const id of d.record_ids || []) known.add(`${d.scope}|${d.number}|${id}`);
      } catch {
        report.warnings.push('meta.number_registry_backfill không đọc được.');
      }
    }
    const unregistered = [];
    const dangerous = [];
    const check = (scope, number, id) => {
      const n = normalizeNumber(number);
      if (!n) return;
      const owner = reg.get(`${scope}|${n}`);
      if (!owner) unregistered.push(id);
      else if (owner !== id && !known.has(`${scope}|${n}|${id}`)) dangerous.push({ scope, number: n, record_id: id, registered_to: owner });
    };
    for (const r of docs) check(`doc:${r.doc_type || 'other'}`, r.document_number, r.id);
    for (const r of cons) check('contract', r.contract_number, r.id);
    report.info.unregistered_numbers = unregistered;
    report.info.registry_conflicts = dangerous;
    if (backfilled && unregistered.length > 0) {
      report.warnings.push(
        `${unregistered.length} hồ sơ có số chưa đăng ký trong number_registry (thường do chạy bản cũ sau rollback). ` +
          'Chạy POST /api/admin/number-registry/reconcile (xem trước) rồi ?apply=1.'
      );
    }
    if (dangerous.length > 0) {
      report.blocking.push(
        `${dangerous.length} hồ sơ mang số đã đăng ký cho hồ sơ khác (trùng số phát sinh sau khi có number_registry). ` +
          'Không deploy/mở ghi cho tới khi rà soát và đổi số thủ công.'
      );
    }
    report.info.number_registry_rows = await count('SELECT COUNT(*) AS n FROM number_registry');
    report.info.number_registry_backfill = (await q("SELECT value FROM meta WHERE key = 'number_registry_backfill'"))[0]?.value ?? null;
  }
  return report;
}
