import { store } from '../db/store.ts';
import type { DocumentRecord } from '../types.ts';
import { stageOf, workflowKind, isIssued, ISSUED_PROTECTED_FIELDS, vietnamToday } from './workflow.ts';

export interface RuleError {
  status: 400 | 409;
  error: string;
  code: string;
  params?: Record<string, string>;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Another live document already uses this number (same type: incoming and outgoing registers are separate). */
export function documentNumberTaken(number: string, docType: string | null | undefined, excludeId?: string): DocumentRecord | null {
  const n = norm(number);
  if (!n) return null;
  return store.getDocuments().find((d) => d.id !== excludeId && norm(d.document_number) === n && (d.doc_type || null) === (docType || null)) ?? null;
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
    body.status = body.status ? stageOf('incoming', body.status).status : body.handler ? 'Đã phân công' : 'Chưa phân công';
  }
  if (kind === 'outgoing') {
    // A new outgoing document is a draft unless the caller says otherwise explicitly
    body.status = body.status ? stageOf('outgoing', body.status).status : 'Dự thảo';
    if (isIssued(body) && !body.issue_date) body.issue_date = vietnamToday();
  }
  return null;
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
