import * as fs from 'fs';
import * as path from 'path';

// DATA_DIR can be overridden (tests run against a throwaway copy of data/)
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

export function ensureUploadsDir() {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (_e) {
    // Read-only filesystem in serverless runtime
  }
}

try {
  ensureUploadsDir();
} catch (_e) {}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.ppt':
      return 'application/vnd.ms-powerpoint';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.doc':
      return 'application/msword';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':
      return 'application/vnd.ms-excel';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.csv':
      return 'text/csv; charset=utf-8';
    case '.odt':
      return 'application/vnd.oasis.opendocument.text';
    case '.ods':
      return 'application/vnd.oasis.opendocument.spreadsheet';
    case '.odp':
      return 'application/vnd.oasis.opendocument.presentation';
    case '.rtf':
      return 'application/rtf';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.ico':
      return 'image/x-icon';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    case '.zip':
      return 'application/zip';
    case '.rar':
      return 'application/vnd.rar';
    case '.7z':
      return 'application/x-7z-compressed';
    default:
      return 'application/octet-stream';
  }
}

// Only keys produced by saveUploadedFile ("uploads/<name>") or bundled samples may be read from disk.
const SAFE_FILE_KEY = /^(uploads|samples)\/[^/\\]+$/;

export function isSafeFileKey(key: string): boolean {
  return SAFE_FILE_KEY.test(key) && !key.includes('..');
}

export function resolveFileLocalPath(key: string): string | null {
  if (!isSafeFileKey(key)) return null;
  try {
    const cwd = process.cwd();
    const candidates = key.startsWith('uploads/')
      ? [path.join(DATA_DIR, key)]
      : [path.join(cwd, 'src/client/public', key)];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_e) {
    // fs operations may throw on workers
  }

  return null;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Must stay in sync with the `accept` attribute of the client upload inputs.
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.txt', '.zip',
]);

// Types a browser could execute as active content if opened directly; always served as downloads.
const ACTIVE_CONTENT_TYPES = ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml', 'application/xml'];

export function isActiveContentType(mimeType: string): boolean {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return ACTIVE_CONTENT_TYPES.includes(base) || base === 'application/octet-stream';
}

export class UploadValidationError extends Error {
  constructor(
    message: string,
    readonly code: 'FILE_TYPE_UNSUPPORTED' | 'FILE_TOO_LARGE',
    readonly params?: Record<string, string>
  ) {
    super(message);
  }
}

export function validateUpload(file: { name?: string; size: number }) {
  const ext = path.extname(file.name || '').toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new UploadValidationError(`Định dạng tệp "${ext || 'không xác định'}" không được hỗ trợ.`, 'FILE_TYPE_UNSUPPORTED', {
      ext: ext || '?',
    });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError('Tệp vượt quá giới hạn 5MB cho phép.', 'FILE_TOO_LARGE');
  }
}

export interface SavedUpload {
  file_key: string;
  file_name: string;
  file_size: number;
  file_type: string;
  sha256: string;
}

async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function saveUploadedFile(file: File, env?: any): Promise<SavedUpload> {
  validateUpload(file);
  const originalName = file.name || 'document';
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9-]/g, '_');
  // Random suffix: two uploads in the same millisecond with the same name must not overwrite each other
  const storedName = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${baseName}${ext || '.bin'}`;
  const fileKey = `uploads/${storedName}`;

  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  // Derive the type from the (whitelisted) extension; the client-supplied file.type is untrusted.
  const mimeType = getMimeType(storedName);
  const sha256 = await sha256Hex(uint8);

  if (env?.BUCKET) {
    // Production: Cloudflare R2
    await env.BUCKET.put(fileKey, uint8, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { filename: encodeURIComponent(originalName), sha256 },
      sha256,
    });
  } else if (env?.DB) {
    throw new Error('Chưa cấu hình R2 (binding BUCKET) để lưu tệp.');
  } else {
    // Local dev / tests: data/uploads on disk
    ensureUploadsDir();
    fs.writeFileSync(path.join(UPLOADS_DIR, storedName), Buffer.from(uint8));
  }

  return {
    file_key: fileKey,
    file_name: originalName,
    file_size: file.size,
    file_type: mimeType,
    sha256,
  };
}

// ---------------------------------------------------------------------------
// Upload registry (migration 0004): who uploaded which key, so a file that is not attached to a
// record yet is only readable by its uploader (and admins).
// ---------------------------------------------------------------------------

export interface UploadRow {
  key: string;
  uploaded_by: string;
  original_name: string;
  size: number;
  mime_type: string;
  sha256: string;
  created_at: string;
}

export async function registerUpload(db: any, upload: SavedUpload, userId: string): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO file_uploads (key, uploaded_by, original_name, size, mime_type, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(upload.file_key, userId, upload.file_name, upload.file_size, upload.file_type, upload.sha256, new Date().toISOString())
    .run();
}

export async function getUploadRow(db: any, key: string): Promise<UploadRow | null> {
  return (await db.prepare('SELECT * FROM file_uploads WHERE key = ?').bind(key).first()) ?? null;
}

/**
 * Rolls back an upload whose record could not be saved: removes the stored object, then its
 * file_uploads row. If removing the object fails, the row is kept so the storage check still lists
 * the file (with its uploader) instead of losing track of it.
 */
export async function discardUpload(db: any, key: string, env?: any): Promise<void> {
  try {
    await deleteStoredFile(key, env);
  } catch (err) {
    console.warn('Rollback: could not delete stored file', key, err);
    return;
  }
  try {
    await db.prepare('DELETE FROM file_uploads WHERE key = ?').bind(key).run();
  } catch (err) {
    console.warn('Rollback: could not delete upload registration', key, err);
  }
}

/** Removes a stored object (used to roll back an upload whose record could not be saved). */
export async function deleteStoredFile(key: string, env?: any): Promise<void> {
  if (!isSafeFileKey(key) || !key.startsWith('uploads/')) return;
  if (env?.BUCKET) {
    await env.BUCKET.delete(key);
    return;
  }
  try {
    const localPath = path.join(DATA_DIR, key);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch (_err) {
    // fs is unavailable on Workers
  }
}

/**
 * Original file name from a Content-Disposition value. Files copied from D1 by
 * scripts/migrate-files-to-r2.mjs carry it there, since wrangler cannot set custom metadata.
 */
export function filenameFromContentDisposition(value?: string | null): string | null {
  if (!value) return null;
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain ? plain[1] : null;
}

export interface StoredFile {
  body: ReadableStream | Uint8Array;
  filename: string;
  size?: number;
  etag?: string;
}

// Before R2 was enabled, uploads were stored base64-encoded in D1 (uploaded_files, with large
// files split across file_chunks). Read-only now.
async function readLegacyD1File(db: any, key: string): Promise<{ data: Uint8Array; filename: string } | null> {
  try {
    const row = await db.prepare('SELECT filename, data FROM uploaded_files WHERE key = ?').bind(key).first();
    if (!row) return null;
    let base64Data: string = row.data || '';
    if (!base64Data) {
      const chunks = await db
        .prepare('SELECT data FROM file_chunks WHERE key = ? ORDER BY chunk_index ASC')
        .bind(key)
        .all();
      base64Data = (chunks?.results || []).map((c: any) => c.data).join('');
    }
    if (!base64Data) return null;
    return { data: new Uint8Array(Buffer.from(base64Data, 'base64')), filename: row.filename || 'file' };
  } catch (err) {
    console.warn('Legacy D1 file read failed:', err);
    return null;
  }
}

/**
 * Looks a file up in R2, then legacy D1 storage, then local disk. Legacy D1 files are copied into
 * R2 on first read so the D1 copies can eventually be dropped.
 */
export async function getStoredFile(key: string, env?: any): Promise<StoredFile | null> {
  if (env?.BUCKET) {
    const object = await env.BUCKET.get(key);
    if (object) {
      const encodedName = object.customMetadata?.filename;
      return {
        body: object.body,
        filename: encodedName
          ? decodeURIComponent(encodedName)
          : filenameFromContentDisposition(object.httpMetadata?.contentDisposition) || key.split('/').pop() || 'file',
        size: object.size,
        etag: object.httpEtag,
      };
    }
  }

  if (env?.DB) {
    const legacy = await readLegacyD1File(env.DB, key);
    if (legacy) {
      if (env?.BUCKET) {
        try {
          await env.BUCKET.put(key, legacy.data, {
            httpMetadata: { contentType: getMimeType(key) },
            customMetadata: { filename: encodeURIComponent(legacy.filename) },
          });
        } catch (err) {
          console.warn('Copying legacy file to R2 failed (will retry on next read):', err);
        }
      }
      return { body: legacy.data, filename: legacy.filename, size: legacy.data.length };
    }
  }

  try {
    const localPath = resolveFileLocalPath(key);
    if (localPath && fs.existsSync(localPath)) {
      const data = fs.readFileSync(localPath);
      return { body: new Uint8Array(data), filename: path.basename(localPath), size: data.length };
    }
  } catch (_err) {
    // fs is unavailable on Workers
  }
  return null;
}
