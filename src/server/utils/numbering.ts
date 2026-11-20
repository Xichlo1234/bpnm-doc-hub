import type { SqlDatabase } from '../db/database.ts';
import { parseAutoNumber } from './workflow.ts';

// Atomic allocation (migration 0007). The single statement takes the larger of
// "last allocated + 1" and the number the user asked for, so concurrent saves always differ.
const ALLOCATE_SQL = `INSERT INTO number_sequences (key, last_value) VALUES (?1, ?2)
  ON CONFLICT(key) DO UPDATE SET last_value = MAX(last_value + 1, ?2)
  RETURNING last_value`;

function maxSeqInUse(existingNumbers: string[], docType: string, sequenceKey: string): number {
  let max = 0;
  for (const n of existingNumbers) {
    const p = parseAutoNumber(docType, n);
    if (p && p.sequenceKey === sequenceKey && p.seq > max) max = p.seq;
  }
  return max;
}

/**
 * Reserves an auto-format number. Returns the number to store: the requested one when it is still
 * free, otherwise the next free number (reassigned = true). Manual numbers pass through unchanged.
 */
export async function allocateDocumentNumber(
  db: SqlDatabase,
  docType: string | null | undefined,
  requested: string,
  existingNumbers: string[]
): Promise<{ number: string; reassigned: boolean }> {
  const parsed = parseAutoNumber(docType, requested);
  if (!parsed || !docType) return { number: requested, reassigned: false };
  const floor = maxSeqInUse(existingNumbers, docType, parsed.sequenceKey) + 1;
  const wanted = Math.max(parsed.seq, floor);
  const row = await db.prepare(ALLOCATE_SQL).bind(parsed.sequenceKey, wanted).first<{ last_value: number }>();
  const seq = Number(row?.last_value ?? wanted);
  const number = parsed.rebuild(seq);
  return { number, reassigned: seq !== parsed.seq };
}

/** Next number that allocation would hand out now (for the "suggest number" button). */
export async function peekNextSequence(db: SqlDatabase, sequenceKey: string, floor: number): Promise<number> {
  try {
    const row = await db.prepare('SELECT last_value FROM number_sequences WHERE key = ?').bind(sequenceKey).first<{ last_value: number }>();
    return Math.max(Number(row?.last_value ?? 0) + 1, floor);
  } catch {
    return floor;
  }
}
