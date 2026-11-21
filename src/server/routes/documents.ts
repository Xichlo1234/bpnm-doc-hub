import { Hono, type Context } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { canReadDocument } from '../utils/access.ts';
import { readRecordRequest, storeAttachment, applyCloudLink } from '../utils/recordRequest.ts';
import { syncPrimaryAttachment } from '../utils/attachments.ts';
import { getDatabase } from '../db/database.ts';
import { documentInput, parseInput, withoutUnchangedLinks, revisionConflict } from '../utils/validation.ts';
import { importPreviewHandler, importCommitHandler } from './imports.ts';
import { allocateDocumentNumber, peekNextSequence } from '../utils/numbering.ts';
import {
  prepareNewDocument,
  documentNumberTaken,
  appendDirectiveLog,
  checkPostIssueAdjustment,
  planStatusChange,
  type RuleError,
} from '../utils/documentRules.ts';
import { workflowKind, stageByCode, allowedTransitions, stagesFor, parseAutoNumber, vietnamToday } from '../utils/workflow.ts';
import type { DocumentRecord } from '../types.ts';

export const documentsRouter = new Hono();

/** Adds the workflow steps available from the document's current status (for the UI). */
function withTransitions<T extends { doc_type?: string | null; status?: string | null }>(doc: T): T & { allowed_transitions: string[] } {
  const kind = workflowKind(doc.doc_type);
  return { ...doc, allowed_transitions: kind ? allowedTransitions(kind, doc.status) : [] };
}

const ruleResponse = (c: Context, e: RuleError) => c.json({ error: e.error, code: e.code, params: e.params }, e.status);
const numberTaken = (c: Context, number: string) =>
  c.json({ error: `Số văn bản "${number}" đã được sử dụng.`, code: 'DOCUMENT_NUMBER_TAKEN', params: { number } }, 409);

// GET /api/documents?type=incoming|outgoing|decision|internal|all
documentsRouter.get('/', (c) => {
  const type = c.req.query('type');
  const user = getAuthUser(c);
  const docs = store.getDocuments(type).filter((d) => canReadDocument(user, d));
  return c.json(docs.map(withTransitions));
});

// GET /api/documents/categories
documentsRouter.get('/categories', (c) => {
  return c.json(store.getCategories());
});

// GET /api/documents/workflow — stages and allowed moves, for the UI
documentsRouter.get('/workflow', (c) => {
  return c.json({
    incoming: stagesFor('incoming'),
    outgoing: stagesFor('outgoing'),
  });
});

// GET /api/documents/next-number?type=incoming|outgoing&category=CV&department=HCNS
// A suggestion only: the number is reserved atomically when the document is saved.
documentsRouter.get('/next-number', async (c) => {
  const type = (c.req.query('type') as 'incoming' | 'outgoing') || 'incoming';
  const category = c.req.query('category') || 'CV';
  const department = c.req.query('department') || 'HCNS';
  const suggestion = store.getNextDocumentNumber(type, category, department);
  const parsed = parseAutoNumber(type, suggestion);
  if (!parsed) return c.json({ nextNumber: suggestion });
  const seq = await peekNextSequence(await getDatabase(c.env), parsed.sequenceKey, parsed.seq);
  return c.json({ nextNumber: parsed.rebuild(seq) });
});

// GET /api/documents/:id
documentsRouter.get('/:id', (c) => {
  const id = c.req.param('id') || '';
  const doc = store.getDocument(id);
  if (!doc) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  if (!canReadDocument(getAuthUser(c), doc)) {
    return c.json({ error: 'Văn bản mật: Bạn không có quyền xem hồ sơ này.', code: 'DOCUMENT_FORBIDDEN' }, 403);
  }
  return c.json(withTransitions(doc));
});

// Excel import: preview first, then commit (Admin Only)
documentsRouter.post('/import/preview', requireAdmin, importPreviewHandler('document'));
documentsRouter.post('/bulk-import', requireAdmin, importCommitHandler('document'));

// POST /api/documents (Admin Only)
documentsRouter.post('/', requireAdmin, async (c) => {
  const request = await readRecordRequest(c);
  if (request.file) request.body.doc_type = request.body.doc_type || 'internal';

  const parsed = parseInput(c, documentInput.create, request.body);
  if (!parsed.ok) return parsed.response;
  const body: any = parsed.data;
  applyCloudLink(body);

  if (!body.document_number || !body.title) {
    return c.json({ error: 'Missing required fields (document_number, title)', code: 'DOCUMENT_FIELDS_REQUIRED' }, 400);
  }
  if (!body.issue_date) body.issue_date = vietnamToday();
  const ruleError = prepareNewDocument(body);
  if (ruleError) return ruleResponse(c, ruleError);

  const db = await getDatabase(c.env);
  const requestedNumber = String(body.document_number).trim();
  // Auto-format numbers are reserved atomically; a number taken meanwhile is replaced by the next free one
  const allocation = await allocateDocumentNumber(
    db,
    body.doc_type,
    requestedNumber,
    [
      ...[...store.getDocuments(), ...store.getTrash().documents].filter((d) => d.doc_type === body.doc_type).map((d) => d.document_number),
      // numbers reserved by renumbered or purged documents of this register
      ...[...store.registeredNumbers().keys()].filter((k) => k.startsWith(`doc:${body.doc_type || 'other'}|`)).map((k) => k.slice(k.indexOf('|') + 1).toUpperCase()),
    ]
  );
  body.document_number = allocation.number;
  if (documentNumberTaken(body.document_number, body.doc_type)) return numberTaken(c, body.document_number);

  const currentUser = getAuthUser(c)!;
  const log = appendDirectiveLog(null, body, currentUser);
  if (log) body.directive_log = log;

  const attachment = request.file ? await storeAttachment(c, request.file, currentUser.id) : null;
  if (attachment) Object.assign(body, attachment.fields);
  // A concurrent request may have taken the number while the file was being stored
  if (documentNumberTaken(body.document_number, body.doc_type)) {
    await attachment?.rollback();
    return numberTaken(c, body.document_number);
  }

  try {
    const newDoc = store.createDocument(body);
    await syncPrimaryAttachment(db, 'document', null, newDoc, currentUser.id);
    store.recordHistory({ record_type: 'document', record_id: newDoc.id, action: 'create', user: currentUser, before: null, after: newDoc });
    store.recordAuditLog({
      user_id: currentUser.id,
      username: currentUser.username,
      action: 'create',
      entity_type: 'document',
      entity_id: newDoc.id,
      entity_title: newDoc.document_number,
      details: `Tạo văn bản ${newDoc.document_number} - ${newDoc.title}`,
    });

    await store.persistAsync();
    return c.json(
      { ...withTransitions(newDoc), ...(allocation.reassigned ? { number_reassigned: true, requested_number: requestedNumber } : {}) },
      201
    );
  } catch (err) {
    // The record was not saved: do not keep its file
    await attachment?.rollback();
    throw err;
  }
});

// PUT/PATCH /api/documents/:id (Admin Only)
async function updateDocumentHandler(c: Context) {
  const id = c.req.param('id') || '';
  const rawBody = await c.req.json().catch(() => null);
  const current = store.getDocument(id);
  const parsed = parseInput(c, documentInput.update, withoutUnchangedLinks(rawBody, current));
  if (!parsed.ok) return parsed.response;
  const { expected_revision, adjustment_reason, status_override_reason, ...changes } = parsed.data as Record<string, any>;
  if (!current) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  const conflict = revisionConflict(c, current, expected_revision);
  if (conflict) return conflict;
  return applyDocumentChange(c, current, changes, { adjustmentReason: adjustment_reason, overrideReason: status_override_reason });
}

/** Shared by PATCH/PUT and /transition: numbers, workflow rules, post-issue adjustments, logs. */
async function applyDocumentChange(
  c: Context,
  current: DocumentRecord,
  changes: Record<string, any>,
  opts: { adjustmentReason?: string; overrideReason?: string; note?: string | null }
) {
  const id = current.id;
  const currentUser = getAuthUser(c)!;
  const docType = changes.doc_type ?? current.doc_type;

  if (changes.document_number !== undefined && documentNumberTaken(changes.document_number, docType, id)) {
    return numberTaken(c, changes.document_number);
  }
  if (changes.doc_type !== undefined && changes.doc_type !== current.doc_type && documentNumberTaken(current.document_number, changes.doc_type, id)) {
    return numberTaken(c, current.document_number);
  }
  const plan = planStatusChange(current, changes, opts.overrideReason);
  if (plan.error) return ruleResponse(c, plan.error);
  const adjustment = checkPostIssueAdjustment(current, changes, opts.adjustmentReason, currentUser);
  if (adjustment.error) return ruleResponse(c, adjustment.error);
  if (adjustment.log) changes.adjustments = adjustment.log;
  const statusNote = plan.changed ? opts.note || `→ ${changes.status}${plan.override ? ` (ngoại lệ: ${opts.overrideReason})` : ''}` : null;
  const log = appendDirectiveLog(current, changes, currentUser, statusNote);
  if (log) changes.directive_log = log;

  const updated = store.updateDocument(id, changes)!;
  await syncPrimaryAttachment(await getDatabase(c.env), 'document', current, updated, currentUser.id);
  store.recordHistory({
    record_type: 'document',
    record_id: id,
    action: plan.override ? 'status_override' : adjustment.log ? 'adjust_after_issue' : 'update',
    user: currentUser,
    before: current,
    after: updated,
  });
  store.recordAuditLog({
    user_id: currentUser.id,
    username: currentUser.username,
    action: plan.changed ? 'status_change' : 'update',
    entity_type: 'document',
    entity_id: id,
    entity_title: updated.document_number,
    details: plan.override
      ? `Chuyển trạng thái ngoài quy trình ${updated.document_number}: ${current.status || '-'} → ${updated.status}. Lý do: ${opts.overrideReason}`
      : adjustment.log
      ? `Điều chỉnh văn bản đã phát hành ${updated.document_number}: ${opts.adjustmentReason}`
      : plan.changed
      ? `${updated.document_number}: ${current.status || '-'} → ${updated.status}`
      : `Cập nhật văn bản ${updated.document_number}`,
  });

  await store.persistAsync();
  return c.json(withTransitions(updated));
}
documentsRouter.put('/:id', requireAdmin, updateDocumentHandler);
documentsRouter.patch('/:id', requireAdmin, updateDocumentHandler);

// POST /api/documents/:id/transition (Admin Only)
// Body: { to: stage code, expected_revision, note?, handler?, due_date?, directive?, signer? }
documentsRouter.post('/:id/transition', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const current = store.getDocument(id);
  if (!current) return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  const kind = workflowKind(current.doc_type);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const conflict = revisionConflict(c, current, body.expected_revision);
  if (conflict) return conflict;
  const target = kind ? stageByCode(kind, String(body.to || '')) : null;
  if (!kind || !target) {
    return c.json(
      { error: 'Không thể chuyển sang bước này từ trạng thái hiện tại.', code: 'TRANSITION_NOT_ALLOWED', params: { from: String(current.status ?? ''), to: String(body.to || '') } },
      400
    );
  }
  const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
  const changes: Record<string, any> = { status: target.status };
  const due = str(body.due_date, 10);
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return c.json({ error: 'Hạn xử lý không hợp lệ (YYYY-MM-DD).', code: 'VALIDATION_FAILED', params: { fields: 'due_date' } }, 400);
  }
  for (const [field, max] of [['handler', 200], ['directive', 2000], ['signer', 200]] as const) {
    const v = str(body[field], max);
    if (v !== undefined) changes[field] = v;
  }
  if (due !== undefined) changes.due_date = due;
  // The /transition endpoint only takes normal steps; exceptions go through PATCH with a reason
  return applyDocumentChange(c, current, changes, { note: str(body.note, 1000) || null });
});

// DELETE /api/documents/:id (Admin Only) — moves the document to the trash (restorable)
documentsRouter.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const currentUser = getAuthUser(c)!;
  const doc = store.getDocument(id);
  const trashed = doc ? store.trashRecord('document', id, currentUser.id) : null;
  if (!doc || !trashed) {
    return c.json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' }, 404);
  }
  store.recordHistory({ record_type: 'document', record_id: id, action: 'delete', user: currentUser, before: { deleted: false }, after: { deleted: true } });
  store.recordAuditLog({
    user_id: currentUser.id,
    username: currentUser.username,
    action: 'delete',
    entity_type: 'document',
    entity_id: id,
    entity_title: doc.document_number,
    details: `Chuyển văn bản ${doc.document_number} vào thùng rác`,
  });

  await store.persistAsync();
  return c.json({ success: true, trashed: true });
});
