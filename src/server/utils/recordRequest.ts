import type { Context } from 'hono';
import { saveUploadedFile, registerUpload, deleteStoredFile, validateUpload, type SavedUpload } from './fileStorage.ts';
import { getDatabase } from '../db/database.ts';

/**
 * Reads a create-record request that is either JSON or multipart (fields + optional `file`).
 * The file is NOT stored here: callers validate the fields and check permissions first, then call
 * storeAttachment(), so a rejected request never leaves an orphan object in R2.
 */
export async function readRecordRequest(c: Context): Promise<{ body: Record<string, any>; file: File | null }> {
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const body: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
      if (key !== 'file' && typeof value === 'string') body[key] = value;
    }
    const file = formData.get('file');
    const hasFile = file && typeof file === 'object' && 'name' in file && (file as File).size > 0;
    if (hasFile) validateUpload(file as File);
    return { body, file: hasFile ? (file as File) : null };
  }
  const body = await c.req.json().catch(() => ({}));
  return { body: body && typeof body === 'object' && !Array.isArray(body) ? body : {}, file: null };
}

/** Stores and registers an attachment; returns the record fields plus a rollback for failures. */
export async function storeAttachment(
  c: Context,
  file: File,
  userId: string
): Promise<{
  fields: Pick<SavedUpload, 'file_key' | 'file_name' | 'file_size' | 'file_type'>;
  sha256: string;
  rollback: () => Promise<void>;
}> {
  const uploaded = await saveUploadedFile(file, c.env);
  const rollback = () => deleteStoredFile(uploaded.file_key, c.env).catch(() => {});
  try {
    await registerUpload(await getDatabase(c.env), uploaded, userId);
  } catch (err) {
    await rollback();
    throw err;
  }
  return {
    fields: { file_key: uploaded.file_key, file_name: uploaded.file_name, file_size: uploaded.file_size, file_type: uploaded.file_type },
    sha256: uploaded.sha256,
    rollback,
  };
}

/** Turns a Drive/OneDrive link given at creation time into the record's attachment fields. */
export function applyCloudLink(body: Record<string, any>) {
  if (!body.google_drive_url || body.file_key) return;
  const driveUrl = String(body.google_drive_url).trim();
  if (!driveUrl) return;
  body.google_drive_url = driveUrl;
  body.file_key = driveUrl;
  if (!body.file_name) {
    body.file_name =
      driveUrl.includes('onedrive') || driveUrl.includes('sharepoint') ? 'OneDrive / SharePoint Link' : 'Google Drive Link';
  }
}
