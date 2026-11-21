import { Hono, type Context } from 'hono';
import { store } from '../db/store.ts';
import { getDatabase } from '../db/database.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { previewImport, rowsToCommit, importBatchStatement, listImportBatches, type ImportKind } from '../utils/importer.ts';

const LABEL: Record<ImportKind, string> = { document: 'văn bản', contract: 'hợp đồng' };

function readRows(body: any, kind: ImportKind): unknown[] | null {
  const list = Array.isArray(body) ? body : body?.rows ?? body?.[`${kind}s`];
  return Array.isArray(list) && list.length > 0 && list.length <= 5000 ? list : null;
}

function listInvalid(c: Context, kind: ImportKind) {
  return kind === 'document'
    ? c.json({ error: 'Danh sách văn bản không hợp lệ hoặc rỗng', code: 'DOCUMENT_LIST_INVALID' }, 400)
    : c.json({ error: 'Danh sách hợp đồng không hợp lệ hoặc rỗng', code: 'CONTRACT_LIST_INVALID' }, 400);
}

/** POST .../import/preview — validates and classifies rows; writes nothing. */
export function importPreviewHandler(kind: ImportKind) {
  return async (c: Context) => {
    const rows = readRows(await c.req.json().catch(() => null), kind);
    if (!rows) return listInvalid(c, kind);
    return c.json(previewImport(kind, rows));
  };
}

/**
 * POST .../bulk-import — commits an import. Refused when any row is invalid (nothing is written), and
 * when rows would update existing records unless `confirm_updates: true` (after the user saw the preview).
 */
export function importCommitHandler(kind: ImportKind) {
  return async (c: Context) => {
    const body = await c.req.json().catch(() => null);
    const rows = readRows(body, kind);
    if (!rows) return listInvalid(c, kind);
    const preview = previewImport(kind, rows);
    if (preview.summary.error > 0) {
      return c.json(
        { error: `Có ${preview.summary.error} dòng không hợp lệ; chưa nhập dòng nào.`, code: 'IMPORT_HAS_ERRORS', params: { count: String(preview.summary.error) }, preview },
        400
      );
    }
    // The commit applies exactly what the user saw: same rows, same matched records, same revisions
    if (typeof body?.preview_token === 'string' && body.preview_token !== preview.preview_token) {
      return c.json({ error: 'Dữ liệu đã thay đổi sau khi xem trước. Vui lòng xem trước lại rồi xác nhận.', code: 'IMPORT_PREVIEW_STALE', preview }, 409);
    }
    if (preview.summary.update > 0 && (body?.confirm_updates !== true || typeof body?.preview_token !== 'string')) {
      return c.json(
        {
          error: `${preview.summary.update} dòng sẽ cập nhật hồ sơ đã có. Vui lòng xem trước và xác nhận.`,
          code: 'IMPORT_CONFIRMATION_REQUIRED',
          params: { count: String(preview.summary.update) },
          preview,
        },
        409
      );
    }

    const user = getAuthUser(c)!;
    const toWrite = rowsToCommit(preview);
    const result = kind === 'document' ? store.bulkUpsertDocuments(toWrite as any) : store.bulkUpsertContracts(toWrite as any);
    for (const ch of result.changes) {
      store.recordHistory({ record_type: kind, record_id: ch.id, action: 'import', user, before: ch.before, after: ch.after });
    }
    const skipped = preview.summary.unchanged + preview.summary.duplicate_in_file;
    store.recordAuditLog({
      user_id: user.id,
      username: user.username,
      action: 'import',
      entity_type: kind,
      details: `Nhập file Excel ${LABEL[kind]}: Thêm mới ${result.added}, Cập nhật ${result.updated}, Bỏ qua ${skipped}`,
    });
    // The import log is part of the same transaction: no success without it
    store.queueStatement((db) =>
      importBatchStatement(db, {
        kind,
        fileName: typeof body?.file_name === 'string' ? body.file_name.slice(0, 300) : null,
        user,
        added: result.added,
        updated: result.updated,
        skipped,
        details: { duplicate_in_file: preview.rows.filter((r) => r.action === 'duplicate_in_file').map((r) => r.key) },
      })
    );
    await store.persistAsync();

    return c.json({
      success: true,
      message: `Đã cập nhật ${result.updated} ${LABEL[kind]} và thêm mới ${result.added} ${LABEL[kind]} thành công. Tổng số: ${result.total}`,
      added: result.added,
      updated: result.updated,
      skipped,
      total: result.total,
    });
  };
}

// GET /api/imports — import history (admin)
export const importsRouter = new Hono();
importsRouter.use('*', requireAdmin);
importsRouter.get('/', async (c) => c.json({ imports: await listImportBatches(await getDatabase(c.env)) }));
