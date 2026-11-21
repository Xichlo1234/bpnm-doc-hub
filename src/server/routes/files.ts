import { Hono } from 'hono';
import {
  saveUploadedFile,
  getStoredFile,
  getMimeType,
  isSafeFileKey,
  isActiveContentType,
  registerUpload,
  discardUpload,
  getUploadRow,
  UploadValidationError,
} from '../utils/fileStorage.ts';
import { store } from '../db/store.ts';
import { getDatabase } from '../db/database.ts';
import { getAuthUser } from './auth.ts';
import { isLaborContract, canAccessLaborContracts } from '../types.ts';
import { canUploadFiles } from '../utils/access.ts';
import { canReadFile } from '../utils/fileAccess.ts';
import { fileInput, parseInput, revisionConflict } from '../utils/validation.ts';

export const filesRouter = new Hono();

// Files are private: never cache in shared caches, never sniff, and never render active content
// (SVG/HTML) inline on our origin where it could run script with the user's session.
function fileResponseHeaders(mimeType: string, filename: string, size?: number): Record<string, string> {
  const active = isActiveContentType(mimeType);
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Disposition': `${active ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (active) headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
  if (size !== undefined) headers['Content-Length'] = size.toString();
  return headers;
}

// POST /api/files/upload (Admin, or users who manage labor contracts)
filesRouter.post('/upload', async (c) => {
  const user = getAuthUser(c);
  if (!canUploadFiles(user)) {
    return c.json({ error: 'Bạn không có quyền tải tệp lên.', code: 'UPLOAD_FORBIDDEN' }, 403);
  }
  let uploadedKey: string | null = null;
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || typeof file !== 'object' || !('name' in file)) {
      return c.json({ error: 'Vui lòng chọn tệp để tải lên', code: 'FILE_REQUIRED' }, 400);
    }

    const uploaded = await saveUploadedFile(file as File, c.env);
    uploadedKey = uploaded.file_key;
    await registerUpload(await getDatabase(c.env), uploaded, user!.id);
    return c.json({
      success: true,
      file_key: uploaded.file_key,
      file_name: uploaded.file_name,
      file_size: uploaded.file_size,
      file_type: uploaded.file_type,
      sha256: uploaded.sha256,
      url: `/api/files/${uploaded.file_key}`,
    });
  } catch (err: any) {
    if (err instanceof UploadValidationError) {
      return c.json({ error: err.message, code: err.code, params: err.params }, 400);
    }
    // The object was stored but could not be registered: remove it rather than leave an orphan
    if (uploadedKey) await discardUpload(await getDatabase(c.env), uploadedKey, c.env);
    console.error('File upload error:', err);
    return c.json({ error: 'Không thể lưu tệp tải lên', code: 'FILE_SAVE_FAILED' }, 500);
  }
});

// POST /api/files/sync-drive
// Stores a Google Drive / OneDrive link on a record. This is a link only: no file is copied.
filesRouter.post('/sync-drive', async (c) => {
  const parsed = parseInput(c, fileInput.syncDrive, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { id, type, drive_url, expected_revision } = parsed.data as any;

  // Same rules as PATCH /api/contracts/:id and PATCH /api/documents/:id
  const user = getAuthUser(c);
  const allowed =
    user?.role === 'admin' ||
    (type === 'contract' && canAccessLaborContracts(user) && isLaborContract(store.getContract(id)));
  if (!allowed) {
    return c.json({ error: 'Truy cập bị từ chối: Bạn không có quyền thực hiện thao tác này.', code: 'FORBIDDEN' }, 403);
  }

  const settings = store.getSettings();
  const targetDriveUrl =
    drive_url && drive_url.trim().length > 0
      ? drive_url.trim()
      : settings.google_drive_folder_url || 'https://drive.google.com/drive/my-drive';

  const existing = type === 'contract' ? store.getContract(id) : store.getDocument(id);
  const conflict = revisionConflict(c, existing, expected_revision);
  if (conflict) return conflict;
  const now = new Date().toISOString();
  const updated =
    type === 'contract'
      ? store.updateContract(id, { google_drive_url: targetDriveUrl, google_drive_synced_at: now })
      : store.updateDocument(id, { google_drive_url: targetDriveUrl, google_drive_synced_at: now });
  if (!updated) {
    return type === 'contract'
      ? c.json({ error: 'Không tìm thấy hợp đồng', code: 'CONTRACT_NOT_FOUND' }, 404)
      : c.json({ error: 'Không tìm thấy văn bản', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  await store.persistAsync();
  return c.json({ success: true, record: updated, google_drive_url: targetDriveUrl, link_only: true });
});

// GET /api/files/:key
filesRouter.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');

  if (!isSafeFileKey(key)) {
    return c.json({ error: 'File not found', code: 'FILE_NOT_FOUND' }, 404);
  }
  if (!(await canReadFile(await getDatabase(c.env), getAuthUser(c), key))) {
    return c.json({ error: 'Bạn không có quyền xem tệp này.', code: 'FILE_FORBIDDEN' }, 403);
  }

  const file = await getStoredFile(key, c.env);
  if (!file) {
    return c.json({ error: 'File not found', code: 'FILE_NOT_FOUND' }, 404);
  }
  // The original file name as uploaded (local disk storage only knows the stored name)
  const registered = await getUploadRow(await getDatabase(c.env), key).catch(() => null);
  const headers = new Headers(fileResponseHeaders(getMimeType(key), registered?.original_name || file.filename, file.size));
  if (file.etag) headers.set('ETag', file.etag);
  return new Response(file.body as any, { headers });
});
