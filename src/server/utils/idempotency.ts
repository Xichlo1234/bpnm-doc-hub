import type { Context } from 'hono';

/**
 * Idempotent record creation without a new table.
 *
 * A client that may resend a create (lost response, timeout, "commit outcome unknown") sends the
 * same `Idempotency-Key` header on every attempt. The server derives the new record's id from
 * (user, key), so:
 *  - a retry that reaches an isolate which already sees the record answers with that record
 *    (200, `idempotent_replay: true`) and writes nothing — no second number is allocated;
 *  - two attempts racing on different isolates both try to insert the same id: the existing
 *    revision guard (a new row whose id already exists) aborts the second batch atomically.
 * Requests without the header (older clients) keep the previous behaviour. The id lives as long as
 * the record, so a key is never reused for a different record by the same user.
 */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type IdempotencyKey = { ok: true; key: string | null } | { ok: false };

export function readIdempotencyKey(c: Context): IdempotencyKey {
  const raw = c.req.header(IDEMPOTENCY_HEADER);
  if (raw === undefined || raw === '') return { ok: true, key: null };
  const key = raw.trim();
  return KEY_PATTERN.test(key) ? { ok: true, key } : { ok: false };
}

export function idempotencyKeyInvalid(c: Context) {
  return c.json(
    { error: 'Idempotency-Key không hợp lệ (16–128 ký tự A-Z, a-z, 0-9, "-", "_").', code: 'VALIDATION_FAILED', params: { fields: IDEMPOTENCY_HEADER } },
    400
  );
}

/** Record id for a create sent with an Idempotency-Key: stable per user and key, unguessable across users. */
export async function idempotentRecordId(prefix: string, userId: string, key: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${prefix}\u0000${userId}\u0000${key}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `${prefix}-k${[...digest.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
