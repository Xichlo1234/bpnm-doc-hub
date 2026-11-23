import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore, store } from '../src/server/db/store.ts';
import { getDatabase, type SqlDatabase, type SqlStatement } from '../src/server/db/database.ts';
import { commitChanges, CommitOutcomeUnknownError } from '../src/server/db/repository.ts';
import { idempotentRecordId } from '../src/server/utils/idempotency.ts';
import { api } from '../src/client/src/services/api.ts';
import { fetchAs } from './setup.ts';

// Synthetic fixtures only (tests/fixtures + records created below).
const admin = (path: string, init?: RequestInit) => fetchAs('admin_root', path, init);
const jsonBody = (data: unknown, headers: Record<string, string> = {}, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(data),
});
const parse = async (response: Response) => (await response.json()) as any;

it('keeps a create outcome ambiguous after a gateway timeout or unreadable success response', async () => {
  const sent = vi.fn()
    .mockResolvedValueOnce(new Response('Gateway timeout', { status: 504 }))
    .mockResolvedValueOnce(new Response('Incomplete response', { status: 201 }))
    .mockResolvedValueOnce(Response.json({ id: 'doc-fixture', idempotent_replay: true }));
  vi.stubGlobal('fetch', sent);
  try {
    const options = { idempotencyKey: 'synthetic-fixture-key' };
    const data = { title: 'Synthetic fixture' };
    await expect(api.createDocument(data, undefined, options)).rejects.toMatchObject({ outcomeUnknown: true });
    await expect(api.createDocument(data, undefined, options)).rejects.toMatchObject({ outcomeUnknown: true });
    await expect(api.createDocument(data, undefined, options)).resolves.toMatchObject({ id: 'doc-fixture', idempotent_replay: true });
    for (const [, init] of sent.mock.calls) {
      expect(new Headers(init.headers).get('Idempotency-Key')).toBe(options.idempotencyKey);
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

/** Gives a second, historical record the same number, as legacy data may (bypasses number_registry). */
async function legacyDuplicate(table: 'contracts' | 'documents', id: string, number: string) {
  const db = await getDatabase();
  await store.flush(db);
  if (table === 'contracts') {
    await db.prepare('INSERT INTO contracts (id, contract_number, title, status, revision) VALUES (?,?,?,?,1)')
      .bind(id, number, 'Synthetic legacy contract B', 'active').run();
  } else {
    await db.prepare('INSERT INTO documents (id, document_number, title, doc_type, issue_date, revision) VALUES (?,?,?,?,?,1)')
      .bind(id, number, 'Synthetic legacy document B', 'incoming', '2025-01-02').run();
  }
  await db.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'data_version'").run();
}

/** A database whose batch commits and then loses its response; the receipt read can fail too. */
function lossyDatabase(db: SqlDatabase, opts: { receiptReadFails: boolean }): SqlDatabase {
  return {
    prepare(sql: string): SqlStatement {
      const statement = db.prepare(sql);
      if (!opts.receiptReadFails || !/SELECT version FROM request_commits/.test(sql)) return statement;
      const failing: SqlStatement = {
        bind: () => failing,
        all: () => Promise.reject(new Error('Synthetic network error')),
        first: () => Promise.reject(new Error('Synthetic network error')),
        run: () => Promise.reject(new Error('Synthetic network error')),
      };
      return failing;
    },
    async batch(statements) {
      await db.batch(statements);
      throw new Error('Synthetic timeout after commit');
    },
  };
}

beforeEach(() => store.reset());
afterEach(() => vi.restoreAllMocks());

describe('A-F1: import preview deduplicates matched rows by record id', () => {
  it('keeps two rows naming distinct historical contracts that share one number', async () => {
    const number = 'HĐ-SYN-DUP-01';
    const first = store.createContract({ contract_number: number, title: 'Synthetic contract A', status: 'active' } as any);
    await legacyDuplicate('contracts', 'con-legacy-dup-b', number);

    const rows = [
      { id: first.id, contract_number: number, notes: 'Row for A' },
      { id: 'con-legacy-dup-b', contract_number: number, notes: 'Row for B' },
    ];
    const preview = await parse(await admin('/api/contracts/import/preview', jsonBody({ rows })));
    expect(preview.rows.map((r: any) => [r.action, r.id])).toEqual([
      ['update', first.id],
      ['update', 'con-legacy-dup-b'],
    ]);
    expect(preview.summary).toMatchObject({ update: 2, duplicate_in_file: 0, error: 0 });

    const commit = await admin('/api/contracts/bulk-import', jsonBody({ rows, confirm_updates: true, preview_fingerprint: preview.preview_fingerprint }));
    expect(commit.status).toBe(200);
    expect(await parse(commit)).toMatchObject({ updated: 2, added: 0, skipped: 0 });
    expect(store.getContract(first.id)?.notes).toBe('Row for A');
    expect(store.getContract('con-legacy-dup-b')?.notes).toBe('Row for B');
  });

  it('still marks a second row for the same record as a duplicate in the file', async () => {
    const number = 'HĐ-SYN-DUP-02';
    const first = store.createContract({ contract_number: number, title: 'Synthetic contract', status: 'active' } as any);
    const rows = [
      { id: first.id, contract_number: number, notes: 'first' },
      { contract_number: number, notes: 'same record by number' },
    ];
    const preview = await parse(await admin('/api/contracts/import/preview', jsonBody({ rows })));
    expect(preview.rows.map((r: any) => r.action)).toEqual(['update', 'duplicate_in_file']);
  });

  it('documents keep the same id-based behaviour for historical duplicates in one register', async () => {
    const number = 'SỐ-SYN-DUP-03';
    const first = store.createDocument({ document_number: number, title: 'Synthetic document A', doc_type: 'incoming', issue_date: '2025-01-01' } as any);
    await legacyDuplicate('documents', 'doc-legacy-dup-b', number);
    const rows = [
      { id: first.id, document_number: number, doc_type: 'incoming', notes: 'A' },
      { id: 'doc-legacy-dup-b', document_number: number, doc_type: 'incoming', notes: 'B' },
    ];
    const preview = await parse(await admin('/api/documents/import/preview', jsonBody({ rows })));
    expect(preview.summary).toMatchObject({ update: 2, duplicate_in_file: 0, error: 0 });
  });
});

describe('A-F2: an auto-numbered create is safe to retry with the same Idempotency-Key', () => {
  const draft = (title: string, number = 'ĐẾN-2026-0001') => ({
    document_number: number,
    title,
    doc_type: 'incoming',
    issue_date: '2026-03-01',
    issuer: 'Synthetic agency',
  });
  const sequence = async () =>
    Number((await (await getDatabase()).prepare("SELECT last_value FROM number_sequences WHERE key = 'incoming:2026'").first<any>())?.last_value ?? 0);

  it('a resend after a lost response returns the first document; no second record or number', async () => {
    const key = 'synthetic-key-0000000001';
    const created = await admin('/api/documents', jsonBody(draft('Synthetic create'), { 'Idempotency-Key': key }));
    expect(created.status).toBe(201);
    const first = await parse(created);
    const seqAfterFirst = await sequence();

    // The client never saw that response and sends the same attempt again
    const retry = await admin('/api/documents', jsonBody(draft('Synthetic create'), { 'Idempotency-Key': key }));
    expect(retry.status).toBe(200);
    const replay = await parse(retry);
    expect(replay).toMatchObject({ id: first.id, document_number: first.document_number, idempotent_replay: true });
    expect(await sequence()).toBe(seqAfterFirst);
    expect(store.getDocuments().filter((d) => d.title === 'Synthetic create')).toHaveLength(1);
  });

  it('the key is scoped to the user and never leaks another user’s record id', async () => {
    const key = 'synthetic-key-0000000002';
    expect(await idempotentRecordId('doc', 'admin_root', key)).not.toBe(await idempotentRecordId('doc', 'other_admin', key));
    expect(await idempotentRecordId('doc', 'admin_root', key)).toMatch(/^doc-k[0-9a-f]{24}$/);
  });

  it('an unknown commit outcome answers 503 COMMIT_OUTCOME_UNKNOWN, keeps the file, and the retry resolves it', async () => {
    const db = await getDatabase();
    await store.flush(db);
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(() => store.flush(lossyDatabase(db, { receiptReadFails: true })));
    const key = 'synthetic-key-0000000003';
    const form = () => {
      const f = new FormData();
      for (const [k, v] of Object.entries(draft('Synthetic unknown outcome'))) f.set(k, v);
      f.set('file', new File(['synthetic attachment'], 'fixture.txt', { type: 'text/plain' }));
      return f;
    };
    const lost = await admin('/api/documents', { method: 'POST', body: form(), headers: { 'Idempotency-Key': key } });
    expect(lost.status).toBe(503);
    expect(await parse(lost)).toMatchObject({ code: 'COMMIT_OUTCOME_UNKNOWN', outcome: 'unknown' });

    const retry = await admin('/api/documents', { method: 'POST', body: form(), headers: { 'Idempotency-Key': key } });
    expect(retry.status).toBe(200);
    const record = await parse(retry);
    expect(record).toMatchObject({ idempotent_replay: true, title: 'Synthetic unknown outcome' });
    // The committed record still has its file: the unknown outcome did not roll the upload back
    expect((await admin('/api/files/' + record.file_key)).status).toBe(200);
    expect(store.getDocuments().filter((d) => d.title === 'Synthetic unknown outcome')).toHaveLength(1);
  });

  it('two attempts racing on different isolates create one document; the loser answers with it', async () => {
    const db = await getDatabase();
    await store.flush(db);
    const key = 'synthetic-key-0000000004';
    const id = await idempotentRecordId('doc', 'admin_root', key);
    const other = new MemoryStore();
    await other.sync(db, 'json');
    const commit = store.persistAsync.bind(store);
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(async () => {
      // The other isolate commits the same attempt after this one passed its replay check
      other.createDocument({ ...draft('Synthetic race', 'ĐẾN-2026-0900'), status: 'Chưa phân công' } as any, { id });
      await other.flush(db);
      await commit();
    });
    const response = await admin('/api/documents', jsonBody(draft('Synthetic race'), { 'Idempotency-Key': key }));
    expect(response.status).toBe(200);
    expect(await parse(response)).toMatchObject({ id, document_number: 'ĐẾN-2026-0900', idempotent_replay: true });
    const rows = await db.prepare("SELECT id FROM documents WHERE title = 'Synthetic race'").all<any>();
    expect(rows.results.map((r: any) => r.id)).toEqual([id]);
  });

  it('a trashed replay target is reported, not recreated', async () => {
    const key = 'synthetic-key-0000000005';
    const first = await parse(await admin('/api/documents', jsonBody(draft('Synthetic trashed'), { 'Idempotency-Key': key })));
    expect((await admin('/api/documents/' + first.id, { method: 'DELETE' })).status).toBe(200);
    const retry = await admin('/api/documents', jsonBody(draft('Synthetic trashed'), { 'Idempotency-Key': key }));
    expect(retry.status).toBe(409);
    expect(await parse(retry)).toMatchObject({ code: 'IDEMPOTENT_RECORD_TRASHED' });
  });

  it('older clients without the header keep the previous behaviour; a malformed key is refused', async () => {
    const a = await admin('/api/documents', jsonBody(draft('Synthetic legacy client')));
    const b = await admin('/api/documents', jsonBody(draft('Synthetic legacy client')));
    expect([a.status, b.status]).toEqual([201, 201]);
    const [da, db] = [await parse(a), await parse(b)];
    expect(da.id).not.toBe(db.id);
    expect(da.document_number).not.toBe(db.document_number);

    const bad = await admin('/api/documents', jsonBody(draft('Synthetic bad key'), { 'Idempotency-Key': 'short' }));
    expect(bad.status).toBe(400);
    expect(store.getDocuments().some((d) => d.title === 'Synthetic bad key')).toBe(false);
  });
});

describe('A-F3: unresolved commit outcomes are distinguished from failures', () => {
  it('commitChanges distinguishes a saved receipt, a definitive rejection, and an unknown outcome', async () => {
    const db = await getDatabase();
    await store.flush(db);
    const version = Number((await db.prepare("SELECT value FROM meta WHERE key = 'data_version'").first<any>()).value);
    const write = (d: SqlDatabase, note: string) =>
      [d.prepare("INSERT INTO meta (key, value) VALUES ('synthetic_af3', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(note)];

    // Committed, response lost, receipt readable → success
    await expect(commitChanges(lossyDatabase(db, { receiptReadFails: false }), write(db, 'a'), version)).resolves.toMatchObject({ version: version + 1 });

    // Committed, response lost, receipt unreadable → unknown (not a plain failure)
    await expect(commitChanges(lossyDatabase(db, { receiptReadFails: true }), write(db, 'b'), version + 1)).rejects.toBeInstanceOf(CommitOutcomeUnknownError);
    expect((await db.prepare("SELECT value FROM meta WHERE key = 'synthetic_af3'").first<any>()).value).toBe('b');

    // A missing receipt can also mean the batch is still in flight.
    const unreachable: SqlDatabase = { prepare: db.prepare.bind(db), batch: () => Promise.reject(new Error('Synthetic connect refused')) };
    await expect(commitChanges(unreachable, write(db, 'c'), version + 2)).rejects.toBeInstanceOf(CommitOutcomeUnknownError);

    // Rejected by SQLite (constraint) → definitive, without asking for the receipt
    const rejecting: SqlDatabase = {
      prepare: (sql) => {
        if (/SELECT version FROM request_commits/.test(sql)) throw new Error('receipt must not be read for a definitive rejection');
        return db.prepare(sql);
      },
      batch: (s) => db.batch(s),
    };
    await expect(commitChanges(rejecting, [db.prepare('INSERT INTO write_guard (conflict) VALUES (1)')], version + 2)).rejects.toThrow(/constraint/i);
    expect((await db.prepare("SELECT value FROM meta WHERE key = 'synthetic_af3'").first<any>()).value).toBe('b');
  });

  it('an update with an unknown outcome is not reported as a conflict or internal error', async () => {
    const db = await getDatabase();
    await store.flush(db);
    const doc = store.getDocuments()[0];
    vi.spyOn(store, 'persistAsync').mockImplementationOnce(() => store.flush(lossyDatabase(db, { receiptReadFails: true })));
    const response = await admin('/api/documents/' + doc.id, jsonBody({ notes: 'Synthetic AF3 note', expected_revision: doc.revision }, {}, 'PATCH'));
    expect(response.status).toBe(503);
    expect(await parse(response)).toMatchObject({ code: 'COMMIT_OUTCOME_UNKNOWN', outcome: 'unknown' });
    // The next request reloads: the change did land, and the client can see that before retrying
    expect((await parse(await admin('/api/documents/' + doc.id))).notes).toBe('Synthetic AF3 note');
  });
});
