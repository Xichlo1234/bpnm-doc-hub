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
};

const normalizeNumber = (v) => String(v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

export async function runPreflight(query, migrationFiles) {
  const q = async (sql) => {
    if (!READ_ONLY.test(sql)) throw new Error(`preflight refuses a non read-only statement: ${sql}`);
    return query(sql);
  };
  const report = { blocking: [], warnings: [], info: {} };

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
    // Records whose number is not registered (e.g. written by an older build after a rollback)
    const reg = new Map((await q('SELECT scope, number_norm, record_id FROM number_registry')).map((r) => [`${r.scope}|${r.number_norm}`, r.record_id]));
    const unregistered = [];
    for (const r of docs) {
      const n = normalizeNumber(r.document_number);
      if (n && !reg.has(`doc:${r.doc_type || 'other'}|${n}`)) unregistered.push(r.id);
    }
    for (const r of cons) {
      const n = normalizeNumber(r.contract_number);
      if (n && !reg.has(`contract|${n}`)) unregistered.push(r.id);
    }
    report.info.unregistered_numbers = unregistered;
    const backfilled = (await q("SELECT value FROM meta WHERE key = 'number_registry_backfill'")).length > 0;
    if (backfilled && unregistered.length > 0) {
      report.warnings.push(
        `${unregistered.length} hồ sơ có số chưa đăng ký trong number_registry (thường do chạy bản cũ sau rollback). ` +
          'Chạy POST /api/admin/number-registry/reconcile (xem trước) rồi ?apply=1.'
      );
    }
    report.info.number_registry_rows = await count('SELECT COUNT(*) AS n FROM number_registry');
    report.info.number_registry_backfill = (await q("SELECT value FROM meta WHERE key = 'number_registry_backfill'"))[0]?.value ?? null;
  }
  return report;
}
