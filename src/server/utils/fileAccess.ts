import { store } from '../db/store.ts';
import type { SqlDatabase } from '../db/database.ts';
import { canReadContract, canReadDocument, isAdmin, type AccessSubject } from './access.ts';
import { getUploadRow } from './fileStorage.ts';

/** Live records (documents and contracts) whose primary file or attachment (any version) is `key`. */
export function recordsReferencingFile(key: string) {
  const viaAttachments = store.getAllAttachments().filter((a) => a.file_key === key && !a.deleted_at);
  const docIds = new Set(viaAttachments.filter((a) => a.record_type === 'document').map((a) => a.record_id));
  const contractIds = new Set(viaAttachments.filter((a) => a.record_type === 'contract').map((a) => a.record_id));
  return {
    documents: store.getDocuments().filter((d) => d.file_key === key || docIds.has(d.id)),
    contracts: store.getContracts().filter((c) => c.file_key === key || contractIds.has(c.id)),
  };
}

/**
 * A file is readable when the user may read a record that references it. A file no record
 * references yet (just uploaded) is readable by its uploader and admins only. Bundled samples are
 * public static assets anyway.
 */
export async function canReadFile(db: SqlDatabase, user: AccessSubject | null, key: string): Promise<boolean> {
  if (!user) return false;
  const { documents, contracts } = recordsReferencingFile(key);
  if (documents.length > 0 || contracts.length > 0) {
    return documents.some((d) => canReadDocument(user, d)) || contracts.some((c) => canReadContract(user, c));
  }
  if (key.startsWith('samples/')) return true;
  if (isAdmin(user)) return true;
  const upload = await getUploadRow(db, key);
  return Boolean(upload && upload.uploaded_by === user.id);
}

/**
 * Whether `user` may point a record's file_key at `key`. Without this a user could attach another
 * record's confidential file to a record they can read and so gain access to it.
 */
export async function canAttachFile(
  db: SqlDatabase,
  user: AccessSubject | null,
  key: string | null | undefined,
  currentKey?: string | null
): Promise<boolean> {
  if (!user) return false;
  if (!key || key === '#' || key === currentKey || /^https?:\/\//i.test(key) || isAdmin(user)) return true;
  return canReadFile(db, user, key);
}
