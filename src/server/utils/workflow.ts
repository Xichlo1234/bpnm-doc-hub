import { isDirectionalInternalType, type InternalDocumentType } from '../types.ts';

// Document workflows. Stored status values stay the Vietnamese labels the app already uses (and that
// the status categories in Settings list), so existing records and filters keep working; legacy
// variants are accepted as aliases.

export type WorkflowKind = 'incoming' | 'outgoing';

export interface WorkflowStage {
  code: string;
  status: string; // stored value
  aliases?: string[];
}

export const INCOMING_STAGES: WorkflowStage[] = [
  { code: 'received', status: 'Chưa phân công', aliases: ['Chờ tiếp nhận', 'Tiếp nhận'] },
  { code: 'assigned', status: 'Đã phân công' },
  { code: 'processing', status: 'Đang xử lý', aliases: ['Quá hạn'] },
  { code: 'completed', status: 'Hoàn thành' },
  { code: 'archived', status: 'Lưu trữ' },
];

export const OUTGOING_STAGES: WorkflowStage[] = [
  { code: 'draft', status: 'Dự thảo' },
  { code: 'pending_signature', status: 'Trình ký', aliases: ['Chờ ký'] },
  { code: 'signed', status: 'Đã ký - chờ gửi', aliases: ['Đã ký'] },
  { code: 'issued', status: 'Đã gửi', aliases: ['Đã phát hành', 'Phát hành'] },
  { code: 'archived', status: 'Lưu trữ' },
  { code: 'cancelled', status: 'Hủy' },
];

// Allowed moves (forward, plus the usual "send back" steps)
const TRANSITIONS: Record<WorkflowKind, Record<string, string[]>> = {
  incoming: {
    received: ['assigned'],
    assigned: ['processing', 'received', 'completed'],
    processing: ['completed', 'assigned'],
    completed: ['archived', 'processing'],
    archived: [],
  },
  outgoing: {
    draft: ['pending_signature', 'cancelled'],
    pending_signature: ['signed', 'draft', 'cancelled'],
    signed: ['issued', 'pending_signature'],
    issued: ['archived'],
    archived: [],
    cancelled: ['draft'],
  },
};

export function stagesFor(kind: WorkflowKind): WorkflowStage[] {
  return kind === 'incoming' ? INCOMING_STAGES : OUTGOING_STAGES;
}

export function workflowKind(docType?: string | null): WorkflowKind | null {
  if (docType === 'incoming' || docType === 'internal_incoming') return 'incoming';
  if (docType === 'outgoing' || docType === 'internal_outgoing') return 'outgoing';
  return null;
}

/** Stage of a stored status; unknown/empty statuses count as the first stage. */
export function stageOf(kind: WorkflowKind, status?: string | null): WorkflowStage {
  const stages = stagesFor(kind);
  const s = String(status || '').trim();
  return stages.find((st) => st.status === s || st.aliases?.includes(s)) ?? stages[0];
}

export function stageByCode(kind: WorkflowKind, code: string): WorkflowStage | null {
  return stagesFor(kind).find((s) => s.code === code) ?? null;
}

/**
 * Strict lookup: the stage of a stored status, the first stage for an empty status, and null for a
 * value that is not part of the workflow (it is never silently treated as the first stage).
 */
export function findStage(kind: WorkflowKind, status?: string | null): WorkflowStage | null {
  const s = String(status ?? '').trim();
  if (!s) return stagesFor(kind)[0];
  return stagesFor(kind).find((st) => st.status === s || st.aliases?.includes(s)) ?? null;
}

/** Steps reachable from the current status; none from a status outside the workflow. */
export function allowedTransitions(kind: WorkflowKind, status?: string | null): string[] {
  const stage = findStage(kind, status);
  return stage ? TRANSITIONS[kind][stage.code] ?? [] : [];
}

export function isIssued(doc: { doc_type?: string | null; status?: string | null }): boolean {
  if (workflowKind(doc.doc_type) !== 'outgoing') return false;
  const code = findStage('outgoing', doc.status)?.code;
  return code === 'issued' || code === 'archived';
}

/** Fields a step requires on the resulting record. */
export const STAGE_REQUIREMENTS: Record<string, string[]> = {
  assigned: ['handler'],
  processing: ['handler'],
  completed: ['handler'],
  signed: ['signer'],
  issued: ['signer', 'document_number'],
};

export function missingForStage(code: string, record: Record<string, any>): string[] {
  return (STAGE_REQUIREMENTS[code] || []).filter((f) => !String(record[f] ?? '').trim());
}

/** Fields whose change after issuance is an "adjustment" and needs a reason. */
export const ISSUED_PROTECTED_FIELDS = ['document_number', 'title', 'summary', 'signer', 'issue_date', 'recipient', 'doc_category'];

/** Today in Vietnam (UTC+7) as YYYY-MM-DD; records store local dates. */
export function vietnamToday(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Document numbers. Formats are unchanged: incoming "ĐẾN-YYYY-NNNN", outgoing "NNNN/YYYY/CAT-DEPT".
// ---------------------------------------------------------------------------

export interface ParsedNumber {
  sequenceKey: string;
  seq: number;
  rebuild: (seq: number) => string;
}

export function internalNumberPrefix(type: InternalDocumentType): string {
  return type === 'internal_incoming' ? 'NB-ĐẾN' : 'NB-ĐI';
}

export function parseAutoNumber(docType: string | null | undefined, number: string | null | undefined): ParsedNumber | null {
  const n = String(number || '').trim();
  if (isDirectionalInternalType(docType)) {
    const match = /^(NB-ĐẾN|NB-ĐI)-(\d{4})-(\d{1,9})$/.exec(n.normalize('NFC').toUpperCase());
    const prefix = internalNumberPrefix(docType);
    if (!match || match[1] !== prefix) return null;
    return {
      sequenceKey: `${docType}:${match[2]}`,
      seq: Number(match[3]),
      rebuild: (seq) => `${prefix}-${match[2]}-${String(seq).padStart(4, '0')}`,
    };
  }
  if (docType === 'incoming') {
    const m = /^ĐẾN-(\d{4})-(\d{1,6})$/.exec(n);
    if (!m) return null;
    return { sequenceKey: `incoming:${m[1]}`, seq: Number(m[2]), rebuild: (s) => `ĐẾN-${m[1]}-${String(s).padStart(4, '0')}` };
  }
  if (docType === 'outgoing') {
    const m = /^(\d{1,6})\/(\d{4})(\/.*)?$/.exec(n);
    if (!m) return null;
    return { sequenceKey: `outgoing:${m[2]}`, seq: Number(m[1]), rebuild: (s) => `${String(s).padStart(4, '0')}/${m[2]}${m[3] ?? ''}` };
  }
  return null;
}
