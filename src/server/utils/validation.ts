import { z } from 'zod';
import type { Context } from 'hono';
import { documentsTable, contractsTable, partnersTable, type TableSpec } from '../db/tables.ts';

// Request body validation. Record schemas are derived from the column definitions in db/tables.ts so
// types are declared in one place; unknown keys (ad-hoc Excel columns) stay allowed but must be
// scalar values, and server-managed keys (id, timestamps, computed fields) are dropped.

const MAX_TEXT = 20_000;
const MAX_EXTRA_KEYS = 100;

const textValue = z.union([z.string().max(MAX_TEXT), z.number().transform(String)]).nullable();

const numberValue = z
  .union([
    z.number().finite(),
    z.literal('').transform(() => null),
    z
      .string()
      .trim()
      .regex(/^-?\d+(\.\d+)?$/, 'phải là số')
      .transform(Number),
  ])
  .nullable();

const boolValue = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1'), z.literal(0), z.literal(1)])
  .transform((v) => Boolean(v))
  .nullable();

const scalarValue = z.union([z.string().max(MAX_TEXT), z.number().finite(), z.boolean(), z.null()]);

/** http(s) URL; a bare "drive.google.com/..." gets https:// prepended. Anything else (javascript:, data:) is rejected. */
export const httpUrl = z
  .string()
  .trim()
  .max(2_000)
  .transform((v) => (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) ? `https://${v}` : v))
  .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'phải là liên kết http(s)');

// Uploaded keys, bundled samples, or an external http(s) link (Drive/OneDrive)
const fileKeyValue = z
  .string()
  .trim()
  .max(2_000)
  .refine((v) => v === '' || v === '#' || /^(uploads|samples)\/[^/\\]+$/.test(v) || /^https?:\/\//i.test(v), 'không hợp lệ')
  .nullable();

// Never taken from a request body: timestamps, computed fields, and logs/lists that only dedicated
// endpoints maintain (forms send whole records back, including these)
const SERVER_MANAGED_KEYS = [
  'created_at',
  'updated_at',
  'urgency',
  'deadline_status',
  'google_drive_synced_at',
  'revision',
  'allowed_transitions',
  'directive_log',
  'adjustments',
  'appendices',
  'linked_records',
  'issued_at',
  'deleted_at',
  'deleted_by',
  'number_reassigned',
  'requested_number',
];

type RecordMode = 'create' | 'update' | 'import';

function recordSchema(spec: TableSpec, mode: RecordMode) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, col] of Object.entries(spec.columns)) {
    const base = col.type === 'number' ? numberValue : col.type === 'bool' ? boolValue : textValue;
    shape[name] = base.optional();
  }
  shape.file_key = fileKeyValue.optional();
  if ('google_drive_url' in spec.columns) shape.google_drive_url = httpUrl.nullable().optional();
  // Optimistic concurrency: the revision the client loaded (see revisionConflict)
  if (mode === 'update') shape.expected_revision = z.number().int().min(0).optional();

  return z.preprocess(
    (input) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
      const copy: Record<string, unknown> = { ...(input as Record<string, unknown>) };
      for (const key of SERVER_MANAGED_KEYS) delete copy[key];
      // Only bulk import may address records by id; create/update get theirs from the server/URL
      if (mode !== 'import') delete copy.id;
      if (mode !== 'update') delete copy.expected_revision;
      return copy;
    },
    z
      .object(shape)
      .catchall(scalarValue)
      .refine((obj) => Object.keys(obj).length <= Object.keys(shape).length + MAX_EXTRA_KEYS, 'quá nhiều trường')
  );
}

export const documentInput = {
  create: recordSchema(documentsTable, 'create'),
  update: recordSchema(documentsTable, 'update'),
  bulk: z.array(recordSchema(documentsTable, 'import')).min(1).max(5_000),
};

export const contractInput = {
  create: recordSchema(contractsTable, 'create'),
  update: recordSchema(contractsTable, 'update'),
  bulk: z.array(recordSchema(contractsTable, 'import')).min(1).max(5_000),
};

export const partnerInput = {
  create: recordSchema(partnersTable, 'create').pipe(
    z
      .object({
        code: z.string().trim().min(1, 'Mã đối tác là bắt buộc').max(50),
        name_vn: z.string().trim().min(1, 'Tên đối tác (VN) là bắt buộc').max(500),
      })
      .passthrough()
  ),
  update: recordSchema(partnersTable, 'update'),
};

const username = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,50}$/, '3–50 ký tự: chữ, số, dấu chấm, gạch dưới, gạch ngang');
const role = z.enum(['admin', 'user', 'editor']);

export const userInput = {
  create: z.object({
    username,
    password: z.string().max(200),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email('Email không hợp lệ').max(200),
    role: role.optional(),
    department: z.string().max(200).nullable().optional(),
    can_access_labor_contracts: z.boolean().optional(),
    can_access_confidential_documents: z.boolean().optional(),
  }),
  update: z.object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email('Email không hợp lệ').max(200).optional(),
    role: role.optional(),
    status: z.enum(['active', 'locked']).optional(),
    department: z.string().max(200).nullable().optional(),
    preferred_language: z.enum(['vi', 'en', 'km']).optional(),
    can_access_labor_contracts: z.boolean().optional(),
    can_access_confidential_documents: z.boolean().optional(),
    password: z.string().max(200).optional(),
  }),
};

export const authInput = {
  login: z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }),
  changePassword: z.object({ current_password: z.string().max(200), new_password: z.string().max(200) }),
};

const currencyItem = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, 'mã ISO 4217 gồm 3 chữ cái')),
  name: z.string().trim().min(1).max(100),
  symbol: z.string().max(10).optional(),
  decimals: z.coerce.number().int().min(0).max(6).optional(),
  exchange_rate: z.coerce.number().positive().optional(),
  is_default: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const configInput = {
  currency: currencyItem,
  currencies: z.array(currencyItem.extend({ symbol: z.string().max(10), decimals: z.coerce.number().int().min(0).max(6), active: z.boolean() })).max(200),
  settings: z
    .object({
      alert_level_1_days: z.coerce.number().int().min(1).max(3650),
      alert_level_2_days: z.coerce.number().int().min(1).max(3650),
      report_currency: z.string().regex(/^[A-Z]{3}$/),
      company_code: z.string().trim().min(1).max(20),
      company_name: z.string().trim().min(1).max(300),
      google_drive_folder_url: httpUrl,
    })
    .partial(), // unknown keys are dropped
  // Category lists hold small user-defined items (strings or flat objects)
  categoryType: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/i, 'loại danh mục không hợp lệ').refine((v) => !['__proto__', 'constructor', 'prototype'].includes(v)),
  categoryItem: z.union([scalarValue, z.record(z.string(), scalarValue)]).refine((v) => JSON.stringify(v).length <= 5_000, 'mục danh mục quá lớn'),
};

export const fileInput = {
  syncDrive: z.object({
    id: z.string().min(1).max(200),
    type: z.enum(['contract', 'document']),
    drive_url: httpUrl.optional(),
  }),
};

/**
 * Drops link fields the client sent back unchanged, so records saved before validation existed
 * (e.g. a free-text file_key) stay editable; only new values are validated.
 */
export function withoutUnchangedLinks(body: unknown, existing: Record<string, any> | null): unknown {
  if (!existing || !body || typeof body !== 'object' || Array.isArray(body)) return body;
  const copy: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of ['file_key', 'google_drive_url']) {
    if (key in copy && copy[key] === existing[key]) delete copy[key];
  }
  return copy;
}

/**
 * Returns a 409 response when the client edited an older revision than the one stored, so a
 * concurrent save is never silently overwritten. Clients that send no expected_revision opt out.
 */
export function revisionConflict(
  c: Context,
  existing: { revision?: number } | null,
  expectedRevision: number | undefined
): Response | null {
  if (!existing || expectedRevision === undefined || expectedRevision === (existing.revision ?? 0)) return null;
  return c.json(
    {
      error: 'Hồ sơ đã được người khác cập nhật trong lúc bạn chỉnh sửa. Vui lòng mở lại để xem bản mới nhất rồi sửa lại.',
      code: 'REVISION_CONFLICT',
      current: existing,
    },
    409
  );
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

/** Parses data with schema; on failure returns a 400 response to send instead. */
export function parseInput<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
  data: unknown
): { ok: true; data: z.infer<T> } | { ok: false; response: Response } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const fields = [...new Set(result.error.issues.map((i) => i.path.join('.')).filter(Boolean))].slice(0, 5).join(', ');
  return {
    ok: false,
    response: c.json(
      { error: `Dữ liệu không hợp lệ: ${describeIssues(result.error)}`, code: 'VALIDATION_FAILED', params: { fields: fields || '-' } },
      400
    ),
  };
}
