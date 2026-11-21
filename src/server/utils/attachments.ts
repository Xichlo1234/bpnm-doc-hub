import { store } from '../db/store.ts';
import type { SqlDatabase } from '../db/database.ts';
import type { AttachmentRecord, AttachmentRecordType, ContractRecord, DocumentRecord } from '../types.ts';
import { canAccessLaborContracts, isLaborContract } from '../types.ts';
import { canReadContract, canReadDocument, isAdmin, type AccessSubject } from './access.ts';
import { getUploadRow } from './fileStorage.ts';

export type AnyRecord = DocumentRecord | ContractRecord;

export function getRecord(type: AttachmentRecordType, id: string): AnyRecord | null {
  return type === 'document' ? store.getDocument(id) : store.getContract(id);
}

export function canReadRecord(user: AccessSubject | null | undefined, type: AttachmentRecordType, record: AnyRecord | null): boolean {
  return type === 'document' ? canReadDocument(user, record as DocumentRecord) : canReadContract(user, record as ContractRecord);
}

/** Same rules as the record's PATCH route: admins, or labor-contract managers for labor contracts. */
export function canWriteRecord(user: AccessSubject | null | undefined, type: AttachmentRecordType, record: AnyRecord | null): boolean {
  if (!user || !record) return false;
  if (isAdmin(user)) return true;
  return type === 'contract' && canAccessLaborContracts(user) && isLaborContract(record as ContractRecord);
}

function isStoredKey(key?: string | null): key is string {
  return Boolean(key && /^(uploads|samples)\//.test(key));
}

async function attachmentFieldsForKey(db: SqlDatabase, key: string, record: AnyRecord, fallbackUser: string) {
  const upload = await getUploadRow(db, key).catch(() => null);
  return {
    file_key: key,
    original_name: upload?.original_name || record.file_name || key.split('/').pop() || 'file',
    size: Number(upload?.size ?? record.file_size ?? 0),
    mime_type: upload?.mime_type || record.file_type || 'application/octet-stream',
    sha256: upload?.sha256 || '',
    uploaded_by: upload?.uploaded_by || fallbackUser,
  };
}

/**
 * Records created before migration 0006 hold their file only in file_key. The first time such a
 * record's attachments are touched, that file gets an attachment row so it shows up as version 1.
 */
/** Stable id of the version-1 row of a pre-0006 record's file (the same before and after it is stored). */
export const legacyAttachmentId = (type: AttachmentRecordType, recordId: string) => `att_legacy_${type}_${recordId}`;

export async function ensureLegacyAttachment(db: SqlDatabase, type: AttachmentRecordType, record: AnyRecord): Promise<AttachmentRecord | null> {
  if (!isStoredKey(record.file_key)) return null;
  const existing = store.getAttachments(type, record.id, { includeVersions: true }).find((a) => a.file_key === record.file_key);
  if (existing) return existing;
  return store.addAttachment({ id: legacyAttachmentId(type, record.id), record_type: type, record_id: record.id, ...(await attachmentFieldsForKey(db, record.file_key, record, 'legacy')) });
}

/** What ensureLegacyAttachment would store, without changing anything (for read-only requests). */
export async function legacyAttachmentView(db: SqlDatabase, type: AttachmentRecordType, record: AnyRecord): Promise<AttachmentRecord | null> {
  if (!isStoredKey(record.file_key)) return null;
  const id = legacyAttachmentId(type, record.id);
  return { id, series_id: id, version: 1, is_current: true, uploaded_at: record.created_at, revision: 0, record_type: type, record_id: record.id, ...(await attachmentFieldsForKey(db, record.file_key, record, 'legacy')) } as AttachmentRecord;
}

/**
 * Keeps the attachment rows in step with the record's primary file_key after a create/update.
 * A new key becomes a new version of the previous primary attachment (file replacement).
 */
export async function syncPrimaryAttachment(
  db: SqlDatabase,
  type: AttachmentRecordType,
  before: AnyRecord | null,
  after: AnyRecord,
  userId: string
): Promise<void> {
  if (!isStoredKey(after.file_key) || before?.file_key === after.file_key) return;
  const already = store.getAttachments(type, after.id, { includeVersions: true }).find((a) => a.file_key === after.file_key && !a.deleted_at);
  if (already) return;
  const previous = before ? await ensureLegacyAttachment(db, type, before) : null;
  store.addAttachment({
    record_type: type,
    record_id: after.id,
    ...(await attachmentFieldsForKey(db, after.file_key, after, userId)),
    uploaded_by: userId,
    replaces: previous?.is_current ? previous.id : null,
  });
}

/** Sets the record's primary file fields (shown by the existing UI) from an attachment, or clears them. */
export function setPrimaryFile(type: AttachmentRecordType, recordId: string, att: AttachmentRecord | null) {
  const fields = att
    ? { file_key: att.file_key, file_name: att.original_name, file_size: att.size, file_type: att.mime_type }
    : { file_key: null, file_name: null, file_size: null, file_type: null };
  return type === 'document' ? store.updateDocument(recordId, fields) : store.updateContract(recordId, fields);
}

/** Every file key still referenced by a live (not purged) record or attachment row. */
export function referencedFileKeys(): Set<string> {
  const keys = new Set<string>();
  const { documents, contracts } = store.getTrash();
  for (const r of [...store.getDocuments(), ...store.getContracts(), ...documents, ...contracts]) {
    if (r.file_key) keys.add(r.file_key);
  }
  for (const a of store.getAllAttachments()) keys.add(a.file_key);
  return keys;
}
