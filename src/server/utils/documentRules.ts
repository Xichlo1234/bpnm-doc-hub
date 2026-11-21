import { store } from '../db/store.ts';
import { normalizeNumber, numberScope } from './numberKeys.ts';
import type { DocumentRecord } from '../types.ts';
import {
  workflowKind,
  isIssued,
  findStage,
  allowedTransitions,
  missingForStage,
  ISSUED_PROTECTED_FIELDS,
  vietnamToday,
  type WorkflowKind,
} from './workflow.ts';

export interface RuleError {
  status: 400 | 409;
  error: string;
  code: string;
  params?: Record<string, string>;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * Another document of the same register already uses this number — including documents in the trash:
 * a number is never handed out twice (the database enforces it too, migration 0008).
 */
export function documentNumberTaken(number: string, docType: string | null | undefined, excludeId?: string): DocumentRecord | null {
  const n = normalizeNumber(number);
  if (!n) return null;
  const scope = numberScope('document', { doc_type: docType });
  const all = [...store.getDocuments(), ...store.getTrash().documents];
  const holder = all.find((d) => d.id !== excludeId && normalizeNumber(d.document_number) === n && numberScope('document', d) === scope);
  if (holder) return holder;
  // Numbers once held by a renumbered or purged record stay reserved (number_registry)
  const owner = store.numberOwnerOf(`${scope}|${n}`);
  return owner && owner !== excludeId ? ({ id: owner, document_number: number } as DocumentRecord) : null;
}

export interface DirectiveLogEntry {
  at: string;
  by: string;
  by_name: string | null;
  handler: string | null;
  directive: string | null;
  due_date: string | null;
  note?: string | null;
}

export function appendDirectiveLog(
  current: Partial<DocumentRecord> | null,
  next: Record<string, any>,
  user: { id: string; name?: string | null; username?: string | null },
  note?: string | null
): DirectiveLogEntry[] | undefined {
  const prevLog = (((current as any)?.directive_log as DirectiveLogEntry[]) || []).slice();
  const handler = next.handler !== undefined ? next.handler : current?.handler;
  const directive = next.directive !== undefined ? next.directive : current?.directive;
  const due = next.due_date !== undefined ? next.due_date : current?.due_date;
  const changed =
    (next.handler !== undefined && norm(next.handler) !== norm(current?.handler)) ||
    (next.directive !== undefined && norm(next.directive) !== norm(current?.directive)) ||
    (next.due_date !== undefined && norm(next.due_date) !== norm(current?.due_date));
  if (!changed && !note) return undefined;
  if (!handler && !directive && !note) return undefined;
  prevLog.push({
    at: new Date().toISOString(),
    by: user.id,
    by_name: user.name || user.username || null,
    handler: handler || null,
    directive: directive || null,
    due_date: due || null,
    ...(note ? { note } : {}),
  });
  return prevLog;
}

/** Fills workflow defaults on create and validates the incoming/outgoing specific rules. */
export function prepareNewDocument(body: Record<string, any>): RuleError | null {
  const kind = workflowKind(body.doc_type);
  if (kind === 'incoming') {
    // The register number (số đến) is assigned by us; the sender's own number is original_doc_number
    if (body.original_doc_number && norm(body.original_doc_number) === norm(body.document_number)) {
      return {
        status: 400,
        error: 'Số đến phải khác số văn bản của cơ quan gửi (nhập số của cơ quan gửi vào ô "Số văn bản gốc").',
        code: 'INCOMING_NUMBER_SAME_AS_ORIGINAL',
      };
    }
    if (!body.received_date) body.received_date = vietnamToday();
    if (!body.status) body.status = body.handler ? 'Đã phân công' : 'Chưa phân công';
  }
  if (kind === 'outgoing' && !body.status) {
    // A new outgoing document is a draft unless the caller says otherwise explicitly
    body.status = 'Dự thảo';
  }
  if (kind) {
    // An explicit status (e.g. registering an already issued document) must be a real stage and
    // meet that stage's requirements
    const stage = findStage(kind, body.status);
    if (!stage) return statusInvalid(body.status);
    const missing = missingForStage(stage.code, body);
    if (missing.length > 0) return fieldsRequired(missing);
    body.status = stage.status;
    applyStageSideEffects(stage.code, null, body);
  }
  return null;
}

function statusInvalid(status: unknown): RuleError {
  return {
    status: 400,
    error: `Trạng thái "${String(status)}" không thuộc quy trình.`,
    code: 'STATUS_INVALID',
    params: { status: String(status ?? '') },
  };
}

function fieldsRequired(fields: string[]): RuleError {
  return { status: 400, error: `Cần nhập ${fields.join(', ')} cho bước này.`, code: 'TRANSITION_FIELD_REQUIRED', params: { fields: fields.join(', ') } };
}

/** Dates and markers a step sets on the record (only when not already set). */
function applyStageSideEffects(code: string, current: Partial<DocumentRecord> | null, changes: Record<string, any>) {
  const has = (f: string) => Boolean(changes[f] ?? (current as any)?.[f]);
  if (code === 'completed' && !has('completed_date')) changes.completed_date = vietnamToday();
  if (code === 'issued') {
    if (!has('issue_date')) changes.issue_date = vietnamToday();
    if (!has('issued_at')) changes.issued_at = new Date().toISOString();
  }
}

export interface StatusChangePlan {
  error?: RuleError;
  /** true when the status moves (changes.status was canonicalised and side effects applied) */
  changed: boolean;
  /** a move outside the normal steps, allowed only with a reason (audited) */
  override: boolean;
  from?: string | null;
  to?: string;
}

/**
 * The single rule set for every status change of incoming/outgoing documents (PATCH, PUT and the
 * /transition endpoint): the target must be a workflow stage, reachable from the current one, and the
 * resulting record must satisfy the stage's requirements. A move outside the normal steps needs an
 * explicit override reason; it is recorded in history and the audit log by the caller.
 */
export function planStatusChange(current: DocumentRecord, changes: Record<string, any>, overrideReason?: string | null): StatusChangePlan {
  const kind: WorkflowKind | null = workflowKind(changes.doc_type ?? current.doc_type);
  if (!kind || changes.status === undefined) return { changed: false, override: false };
  const target = findStage(kind, changes.status);
  if (!target) return { error: statusInvalid(changes.status), changed: false, override: false };
  const kindChanged = workflowKind(current.doc_type) !== kind;
  const currentStage = kindChanged ? null : findStage(kind, current.status);
  if (currentStage && currentStage.code === target.code) {
    changes.status = current.status; // same stage (maybe an alias): no move
    return { changed: false, override: false };
  }
  const merged = { ...current, ...changes };
  const missing = missingForStage(target.code, merged);
  if (missing.length > 0) return { error: fieldsRequired(missing), changed: false, override: false };
  const normal = currentStage !== null && allowedTransitions(kind, current.status).includes(target.code);
  const reason = String(overrideReason ?? '').trim();
  if (!normal && !reason) {
    return {
      error: {
        status: 400,
        error: 'Không thể chuyển sang bước này từ trạng thái hiện tại.',
        code: 'TRANSITION_NOT_ALLOWED',
        params: { from: currentStage?.code ?? String(current.status ?? ''), to: target.code },
      },
      changed: false,
      override: false,
    };
  }
  changes.status = target.status;
  applyStageSideEffects(target.code, current, changes);
  return { changed: true, override: !normal, from: currentStage?.code ?? (current.status || null), to: target.code };
}

/**
 * Changes to an issued outgoing document are adjustments: they need a reason and are logged.
 * Returns the adjustment log to store, or an error.
 */
export function checkPostIssueAdjustment(
  current: DocumentRecord,
  changes: Record<string, any>,
  reason: string | undefined,
  user: { id: string; name?: string | null; username?: string | null }
): { error?: RuleError; log?: any[] } {
  if (!isIssued(current)) return {};
  const touched = ISSUED_PROTECTED_FIELDS.filter((f) => f in changes && norm(changes[f]) !== norm((current as any)[f]));
  if (touched.length === 0) return {};
  if (!reason || !reason.trim()) {
    return {
      error: {
        status: 400,
        error: 'Văn bản đã phát hành: cần nhập lý do điều chỉnh.',
        code: 'ADJUSTMENT_REASON_REQUIRED',
        params: { fields: touched.join(', ') },
      },
    };
  }
  const log = (((current as any).adjustments as any[]) || []).slice();
  log.push({
    at: new Date().toISOString(),
    by: user.id,
    by_name: user.name || user.username || null,
    reason: reason.trim().slice(0, 1000),
    fields: Object.fromEntries(touched.map((f) => [f, [(current as any)[f] ?? null, changes[f] ?? null]])),
  });
  return { log };
}
