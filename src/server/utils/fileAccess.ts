import { store } from '../db/store.ts';
import type { SqlDatabase } from '../db/database.ts';
import { canReadContract, canReadDocument, isAdmin, type AccessSubject } from './access.ts';
import { getUploadRow } from './fileStorage.ts';
import { getCleanupRow } from './storageCleanup.ts';

/**
 * Where a stored file is (or was) used:
 *  - live: documents/contracts not in the trash whose primary file or a not-removed attachment
 *    (any version) is `key`;
 *  - past: records in the trash, removed attachments, attachments of trashed/purged records.
 */
export function fileReferences(key: string) {
  const liveDocs = new Map(store.getDocuments().map((d) => [d.id, d]));
  const liveContracts = new Map(store.getContracts().map((c) => [c.id, c]));
  const documents = [...liveDocs.values()].filter((d) => d.file_key === key);
  const contracts = [...liveContracts.values()].filter((c) => c.file_key === key);
  let past = false;
  for (const a of store.getAllAttachments()) {
    if (a.file_key !== key) continue;
    const rec = a.record_type === 'document' ? liveDocs.get(a.record_id) : liveContracts.get(a.record_id);
    if (!a.deleted_at && rec) {
      if (a.record_type === 'document' && !documents.includes(rec as any)) documents.push(rec as any);
      if (a.record_type === 'contract' && !contracts.includes(rec as any)) contracts.push(rec as any);
    } else {
      past = true;
    }
  }
  const trash = store.getTrash();
  if (trash.documents.some((d) => d.file_key === key) || trash.contracts.some((c) => c.file_key === key)) past = true;
  return { documents, contracts, past };
}

/** Kept for callers that only need the live records. */
export function recordsReferencingFile(key: string) {
  const { documents, contracts } = fileReferences(key);
  return { documents, contracts };
}

/**
 * Read access to a stored file:
 *  1. used by live records → only if the user may read at least one of them;
 *  2. bundled samples → any signed-in user (they are public static assets anyway);
 *  3. admins → yes;
 *  4. queued for deletion or deleted (storage_cleanup), ever attached (file_uploads.attached_at),
 *     or used only in the past (record trashed/purged, attachment removed) → admins only, even for
 *     the uploader — also when deleting the object from R2 failed: removing a file or a record never
 *     hands access back to whoever uploaded it;
 *  5. never attached (fresh upload) → only its uploader.
 */
export async function canReadFile(db: SqlDatabase, user: AccessSubject | null, key: string): Promise<boolean> {
  if (!user) return false;
  const refs = fileReferences(key);
  const cleanup = key.startsWith('uploads/') ? await getCleanupRow(db, key) : null;
  const retired = cleanup?.status === 'pending' || cleanup?.status === 'deleted';
  if (!retired && (refs.documents.length > 0 || refs.contracts.length > 0)) {
    return refs.documents.some((d) => canReadDocument(user, d)) || refs.contracts.some((c) => canReadContract(user, c));
  }
  if (key.startsWith('samples/')) return true;
  if (isAdmin(user)) return true;
  if (retired || refs.past || refs.documents.length > 0 || refs.contracts.length > 0) return false;
  const upload = await getUploadRow(db, key);
  return Boolean(upload && upload.uploaded_by === user.id && !upload.attached_at);
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
  if (!key || key === '#' || key === currentKey || /^https?:\/\//i.test(key)) return true;
  // A key queued for deletion or deleted can never be attached again, not even by an admin
  const cleanup = key.startsWith('uploads/') ? await getCleanupRow(db, key) : null;
  if (cleanup?.status === 'pending' || cleanup?.status === 'deleted') return false;
  if (isAdmin(user)) return true;
  return canReadFile(db, user, key);
}
