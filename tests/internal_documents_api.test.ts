import { beforeEach, describe, expect, it } from 'vitest';
import { fetchAs } from './setup.ts';
import { store } from '../src/server/db/store.ts';
import { getDatabase } from '../src/server/db/database.ts';
import { allocateDocumentNumber } from '../src/server/utils/numbering.ts';
import { vietnamToday } from '../src/server/utils/workflow.ts';

const documents = '/api/documents';
const admin = 'admin_root';
const viewer = 'user_viewer';
const directions = ['internal_incoming', 'internal_outgoing'] as const;

function send(method: string, fields: Record<string, unknown>): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) };
}

async function read(response: Response, status = 200) {
  expect(response.status).toBe(status);
  return await response.json() as any;
}

async function create(type: string, fields: Record<string, unknown> = {}) {
  const response = await fetchAs(admin, documents, send('POST', { doc_type: type, title: type, ...fields }));
  return read(response, 201);
}

const nextNumber = async (type: string) =>
  (await read(await fetchAs(admin, `${documents}/next-number?type=${type}`))).nextNumber as string;

describe('Internal document registers', () => {
  beforeEach(() => store.reset());

  it('creates an incoming record, keeps its sender number and applies receipt and assignment rules', async () => {
    const suggestion = await nextNumber('internal_incoming');
    const year = vietnamToday().slice(0, 4);
    expect(suggestion).toMatch(new RegExp(`^NB-ĐẾN-${year}-\\d{4,}$`));
    const doc = await create('internal_incoming', { original_doc_number: 'VP-37', issuer: 'Văn phòng' });
    expect(doc).toMatchObject({
      doc_type: 'internal_incoming', document_number: suggestion, original_doc_number: 'VP-37',
      issuer: 'Văn phòng', received_date: vietnamToday(), status: 'Chưa phân công', allowed_transitions: ['assigned'],
    });
    const transition = `${documents}/${doc.id}/transition`;
    expect(await read(await fetchAs(admin, transition, send('POST', { to: 'assigned' })), 400))
      .toMatchObject({ code: 'TRANSITION_FIELD_REQUIRED' });
    const assigned = await read(await fetchAs(admin, transition, send('POST', { to: 'assigned', handler: 'An' })));
    expect(assigned).toMatchObject({ handler: 'An', status: 'Đã phân công' });
    const sameNumber = send('POST', { doc_type: 'internal_incoming', document_number: 'ABC', original_doc_number: 'ABC', title: 'X' });
    expect(await read(await fetchAs(admin, documents, sameNumber), 400)).toMatchObject({ code: 'INCOMING_NUMBER_SAME_AS_ORIGINAL' });
    const paddedNumber = send('POST', {
      doc_type: 'internal_incoming', title: 'X', document_number: 'NB-ĐẾN-2088-1', original_doc_number: 'NB-ĐẾN-2088-0001',
    });
    expect(await read(await fetchAs(admin, documents, paddedNumber), 400)).toMatchObject({ code: 'INCOMING_NUMBER_SAME_AS_ORIGINAL' });
  });

  it('creates an outgoing draft and requires a reason when changing the issued document', async () => {
    const suggestion = await nextNumber('internal_outgoing');
    expect(suggestion).toMatch(new RegExp(`^NB-ĐI-${vietnamToday().slice(0, 4)}-\\d{4,}$`));
    const doc = await create('internal_outgoing', { document_number: suggestion, recipient: 'Phòng kỹ thuật' });
    expect(doc).toMatchObject({
      doc_type: 'internal_outgoing', document_number: suggestion, recipient: 'Phòng kỹ thuật',
      status: 'Dự thảo', allowed_transitions: ['pending_signature', 'cancelled'],
    });
    const url = `${documents}/${doc.id}`;
    for (const step of [{ to: 'pending_signature' }, { to: 'signed', signer: 'Giám đốc' }, { to: 'issued' }]) {
      await read(await fetchAs(admin, `${url}/transition`, send('POST', step)));
    }
    expect(await read(await fetchAs(admin, url, send('PATCH', { title: 'Đính chính' })), 400))
      .toMatchObject({ code: 'ADJUSTMENT_REASON_REQUIRED' });
  });

  it('tracks internal issue deadlines until dispatch, archiving or cancellation', async () => {
    const fields = { due_date: '2000-01-01' };
    const outgoing = await create('internal_outgoing', fields);
    const incoming = await create('internal_incoming', { ...fields, handler: 'An' });
    expect([outgoing, incoming].map(doc => doc.deadline_status.level)).toEqual(['overdue', 'overdue']);
    const transition = (id: string, to: string, extra = {}) =>
      fetchAs(admin, `${documents}/${id}/transition`, send('POST', { to, ...extra })).then(response => read(response));
    expect((await transition(outgoing.id, 'pending_signature')).deadline_status.level).toBe('overdue');
    expect((await transition(outgoing.id, 'signed', { signer: 'An' })).deadline_status.level).toBe('overdue');
    expect((await transition(outgoing.id, 'issued')).deadline_status.level).toBe('sent');
    expect((await transition(outgoing.id, 'archived')).deadline_status.level).toBe('archived');
    const cancelled = await create('internal_outgoing', fields);
    expect((await transition(cancelled.id, 'cancelled')).deadline_status.level).toBe('cancelled');
    const overdue = await read(await fetchAs(admin, `${documents}?type=overdue`));
    expect(overdue.map((doc: { id: string }) => doc.id)).toContain(incoming.id);
    expect(overdue.map((doc: { id: string }) => doc.id)).not.toContain(outgoing.id);
  });

  it('rejects unknown types on new records and type changes, and keeps historical types editable', async () => {
    const invalid = { doc_type: 'internal_sideways', title: 'X', document_number: 'NB-MANUAL-1' };
    expect(await read(await fetchAs(admin, documents, send('POST', invalid)), 400)).toMatchObject({ code: 'VALIDATION_FAILED' });
    const doc = await create('internal', { document_number: 'NB-HISTORIC' });
    const url = `${documents}/${doc.id}`;
    expect(await read(await fetchAs(admin, url, send('PATCH', { doc_type: invalid.doc_type })), 400))
      .toMatchObject({ code: 'VALIDATION_FAILED' });
    // Persist a record using the unrestricted TEXT column that predates input validation.
    store.updateDocument(doc.id, { doc_type: 'custom_old_register' as typeof doc.doc_type });
    await store.persistAsync();
    expect(await read(await fetchAs(admin, url, send('PUT', { title: 'Updated', doc_type: 'custom_old_register' }))))
      .toMatchObject({ title: 'Updated', doc_type: 'custom_old_register' });
  });

  it.each(directions)('allocates distinct numbers for concurrent saves with the same preview in %s', async (type) => {
    const number = await nextNumber(type);
    const submit = () => create(type, { document_number: number });
    const docs = await Promise.all([submit(), submit(), submit()]);
    expect(new Set(docs.map(doc => doc.document_number)).size).toBe(3);
    expect(docs.filter(doc => doc.document_number === number)).toHaveLength(1);
    expect(docs.filter(doc => doc.number_reassigned && doc.requested_number === number)).toHaveLength(2);
    expect(docs.map(doc => doc.document_number)).not.toContain(await nextNumber(type));
  });

  it('reserves sequences atomically per internal direction and year, independent of external registers', async () => {
    const db = await getDatabase();
    const reserve = (type: string, n: string) => allocateDocumentNumber(db, type, n, []);
    const numbers = await Promise.all(Array.from({ length: 3 }, () => reserve('internal_incoming', 'NB-ĐẾN-2091-0001')));
    expect(numbers.map(n => n.number).sort()).toEqual(['NB-ĐẾN-2091-0001', 'NB-ĐẾN-2091-0002', 'NB-ĐẾN-2091-0003']);
    for (const [type, n] of [
      ['internal_outgoing', 'NB-ĐI-2091-0001'],
      ['internal_incoming', 'NB-ĐẾN-2092-0001'],
      ['incoming', 'ĐẾN-2091-0001'],
      ['outgoing', '0001/2091/CV-HCNS'],
    ]) {
      expect(await reserve(type, n)).toEqual({ number: n, reassigned: false });
    }
  });

  it('keeps a manual number reserved in its own register, including after purge', async () => {
    const number = 'VP NỘI BỘ';
    const shared = { document_number: number };
    const incoming = await create('internal_incoming', shared);
    await create('internal_outgoing', shared);
    await read(await fetchAs(admin, `${documents}/${incoming.id}`, { method: 'DELETE' }));
    await read(await fetchAs(admin, `/api/trash/document/${incoming.id}`, { method: 'DELETE' }));
    const duplicate = send('POST', { doc_type: 'internal_incoming', document_number: ' vp  nội bộ '.normalize('NFD'), title: 'X' });
    expect(await read(await fetchAs(admin, documents, duplicate), 409)).toMatchObject({ code: 'DOCUMENT_NUMBER_TAKEN' });
  });

  it('counts both directions, legacy internal records and decisions without changing their types', async () => {
    const before = await read(await fetchAs(admin, '/api/stats'));
    const historical = store.getDocuments().find(d => d.doc_type === 'internal')!;
    expect(historical).toBeDefined();
    const incoming = await create('internal_incoming');
    const outgoing = await create('internal_outgoing');
    const legacy = await create('internal', { document_number: 'NB-CŨ-1', status: 'Lưu nội bộ' });
    const decision = await create('decision', { document_number: 'QĐ-MẪU' });
    const external = await create('incoming', { document_number: 'BÊN-NGOÀI' });
    const list = async (type: string) => (await read(await fetchAs(admin, `${documents}?type=${type}`))).map((d: { id: string }) => d.id);
    const allInternal = await list('internal');
    expect(allInternal).toEqual(expect.arrayContaining([incoming.id, outgoing.id, legacy.id, decision.id, historical.id]));
    expect(await read(await fetchAs(admin, `${documents}/${historical.id}`)))
      .toMatchObject({ doc_type: 'internal', document_number: historical.document_number });
    expect(allInternal).not.toContain(external.id);
    expect(await list('internal_incoming')).toEqual([incoming.id]);
    expect(await list('internal_outgoing')).toEqual([outgoing.id]);
    expect(await read(await fetchAs(admin, `${documents}/${legacy.id}`)))
      .toMatchObject({ doc_type: 'internal', status: 'Lưu nội bộ', allowed_transitions: [] });
    expect(await read(await fetchAs(admin, '/api/stats'))).toMatchObject({
      totalDocuments: before.totalDocuments + 5, totalInternal: before.totalInternal + 4,
      totalIncoming: before.totalIncoming + 1, totalOutgoing: before.totalOutgoing,
      totalInternalIncoming: before.totalInternalIncoming + 1, totalInternalOutgoing: before.totalInternalOutgoing + 1,
    });
  });

  it.each(directions)('enforces write permissions and confidentiality on the list, detail, search and statistics for %s', async (type) => {
    const before = await read(await fetchAs(viewer, '/api/stats'));
    expect((await fetchAs(viewer, documents, send('POST', { doc_type: type, title: 'X' }))).status).toBe(403);
    const doc = await create(type, { title: 'Unique secret report', security_level: 'Mật' });
    expect((await fetchAs(viewer, `${documents}/${doc.id}`)).status).toBe(403);
    expect((await fetchAs(viewer, `${documents}/${doc.id}`, send('PATCH', { title: 'X' }))).status).toBe(403);
    const visible = await read(await fetchAs(viewer, `${documents}?type=${type}`));
    expect(visible).not.toContainEqual(expect.objectContaining({ id: doc.id }));
    const found = await read(await fetchAs(viewer, '/api/search?q=Unique%20secret%20report'));
    expect(found.documents).not.toContainEqual(expect.objectContaining({ id: doc.id }));
    expect(await read(await fetchAs(viewer, '/api/stats'))).toMatchObject({
      totalDocuments: before.totalDocuments, totalInternal: before.totalInternal,
      totalInternalIncoming: before.totalInternalIncoming, totalInternalOutgoing: before.totalInternalOutgoing,
    });
    const publicDoc = await create(type);
    expect(await read(await fetchAs(viewer, `${documents}/${publicDoc.id}`))).toMatchObject({ doc_type: type });
  });
});
