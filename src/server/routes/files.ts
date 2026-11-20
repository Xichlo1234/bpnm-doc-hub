import { Hono } from 'hono';
import {
  saveUploadedFile,
  getStoredFile,
  getMimeType,
  isSafeFileKey,
  isActiveContentType,
  UploadValidationError,
} from '../utils/fileStorage.ts';
import { store } from '../db/store.ts';
import { getAuthUser, type UserProfile } from './auth.ts';
import { isLaborContract, canAccessLaborContracts } from '../types.ts';
import { fileInput, parseInput } from '../utils/validation.ts';

export const filesRouter = new Hono();

// Attachments of labor contracts are as confidential as the contracts themselves.
function canReadFile(key: string, user: UserProfile | null): boolean {
  if (!user) return false;
  if (canAccessLaborContracts(user)) return true;
  return !store.getContracts().some((ct) => ct.file_key === key && isLaborContract(ct));
}

// Files are private: never cache in shared caches, never sniff, and never render active content
// (SVG/HTML) inline on our origin where it could run script with the user's session.
function fileResponseHeaders(mimeType: string, filename: string, size?: number): Record<string, string> {
  const active = isActiveContentType(mimeType);
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Disposition': `${active ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  if (active) headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
  if (size !== undefined) headers['Content-Length'] = size.toString();
  return headers;
}

// POST /api/files/upload
filesRouter.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || typeof file !== 'object' || !('name' in file)) {
      return c.json({ error: 'Vui lòng chọn tệp để tải lên', code: 'FILE_REQUIRED' }, 400);
    }

    const uploaded = await saveUploadedFile(file as File, c.env);
    return c.json({
      success: true,
      file_key: uploaded.file_key,
      file_name: uploaded.file_name,
      file_size: uploaded.file_size,
      file_type: uploaded.file_type,
      url: `/api/files/${uploaded.file_key}`,
    });
  } catch (err: any) {
    if (err instanceof UploadValidationError) {
      return c.json({ error: err.message, code: err.code, params: err.params }, 400);
    }
    console.error('File upload error:', err);
    return c.json({ error: err?.message || 'Không thể lưu tệp tải lên', code: err?.message ? undefined : 'FILE_SAVE_FAILED' }, 500);
  }
});

// POST /api/files/sync-drive
// Link or update Google Drive URL for a contract or document
filesRouter.post('/sync-drive', async (c) => {
  try {
    const parsed = parseInput(c, fileInput.syncDrive, await c.req.json().catch(() => null));
    if (!parsed.ok) return parsed.response;
    const { id, type, drive_url } = parsed.data;

    // Same rules as PATCH /api/contracts/:id and PATCH /api/documents/:id
    const user = getAuthUser(c);
    const allowed =
      user?.role === 'admin' ||
      (type === 'contract' && canAccessLaborContracts(user) && isLaborContract(store.getContract(id)));
    if (!allowed) {
      return c.json({ error: 'Truy cập bị từ chối: Bạn không có quyền thực hiện thao tác này.', code: 'FORBIDDEN' }, 403);
    }

    const settings = store.getSettings();
    const targetDriveUrl = drive_url && drive_url.trim().length > 0 
      ? drive_url.trim() 
      : (settings.google_drive_folder_url || 'https://drive.google.com/drive/my-drive');

    const now = new Date().toISOString();

    if (type === 'contract') {
      const updated = store.updateContract(id, {
        google_drive_url: targetDriveUrl,
        google_drive_synced_at: now,
      });
      if (!updated) return c.json({ error: 'Không tìm thấy hợp đồng', code: 'CONTRACT_NOT_FOUND' }, 404);
      await store.persistAsync();
      return c.json({ success: true, record: updated, google_drive_url: targetDriveUrl });
    } else if (type === 'document') {
      const updated = store.updateDocument(id, {
        google_drive_url: targetDriveUrl,
        google_drive_synced_at: now,
      });
      if (!updated) return c.json({ error: 'Không tìm thấy văn bản', code: 'DOCUMENT_NOT_FOUND' }, 404);
      await store.persistAsync();
      return c.json({ success: true, record: updated, google_drive_url: targetDriveUrl });
    } else {
      return c.json({ error: 'Loại hồ sơ không hợp lệ (hỗ trợ: contract, document)', code: 'RECORD_KIND_INVALID' }, 400);
    }
  } catch (err: any) {
    console.error('Google drive sync error:', err);
    return c.json({ error: err?.message || 'Lỗi khi chuyển file về Google Drive', code: err?.message ? undefined : 'DRIVE_SYNC_FAILED' }, 500);
  }
});

// GET /api/files/:key
filesRouter.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const env = c.env as any;

  if (!isSafeFileKey(key)) {
    return c.json({ error: 'File not found', code: 'FILE_NOT_FOUND' }, 404);
  }
  if (!canReadFile(key, getAuthUser(c))) {
    return c.json({ error: 'Bạn không có quyền xem tệp này.', code: 'FILE_FORBIDDEN' }, 403);
  }
  
  const file = await getStoredFile(key, c.env);
  if (!file) {
    return c.json({ error: 'File not found', code: 'FILE_NOT_FOUND' }, 404);
  }
  const headers = new Headers(fileResponseHeaders(getMimeType(key), file.filename, file.size));
  if (file.etag) headers.set('ETag', file.etag);
  return new Response(file.body as any, { headers });
});
