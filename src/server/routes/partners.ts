import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { partnerInput, parseInput, revisionConflict } from '../utils/validation.ts';

export const partnersRouter = new Hono();

/** Partner codes are stored trimmed and upper-case; uniqueness is among partners not in the trash. */
export function normalizePartnerCode(code: string): string {
  return String(code ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function partnerCodeTaken(code: string, excludeId?: string): boolean {
  const n = normalizePartnerCode(code);
  return store.getPartners().some((p) => p.id !== excludeId && normalizePartnerCode(p.code) === n);
}

// GET /api/partners
partnersRouter.get('/', (c) => {
  const partners = store.getPartners();
  return c.json(partners);
});

// GET /api/partners/:id
partnersRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const partner = store.getPartner(id);
  if (!partner) {
    return c.json({ error: 'Partner not found', code: 'PARTNER_NOT_FOUND' }, 404);
  }
  return c.json(partner);
});

// POST /api/partners (Admin Only)
partnersRouter.post('/', requireAdmin, async (c) => {
  const parsed = parseInput(c, partnerInput.create, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const body: any = parsed.data;

  // Duplicate code among active partners (the database enforces it too, migration 0010)
  if (partnerCodeTaken(body.code)) {
    return c.json({ error: `Mã đối tác '${body.code}' đã tồn tại trong hệ thống`, code: 'PARTNER_CODE_TAKEN', params: { code: body.code } }, 409);
  }

  const currentUser = getAuthUser(c);
  const newPartner = store.createPartner({
    code: normalizePartnerCode(body.code),
    name_vn: body.name_vn.trim(),
    name_en: body.name_en?.trim() || null,
    category: body.category?.trim() || 'Đối tác',
    tax_id: body.tax_id?.trim() || null,
    representative: body.representative?.trim() || null,
    contact_person: body.contact_person?.trim() || body.contact?.trim() || null,
    contact: body.contact?.trim() || body.contact_person?.trim() || null,
    address: body.address?.trim() || null,
    notes: body.notes?.trim() || null,
    contract_count: 0,
    active_contract_count: 0,
    is_locked: Boolean(body.is_locked),
  });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'create',
    entity_type: 'partner',
    entity_id: newPartner.id,
    entity_title: newPartner.name_vn,
    details: `Thêm đối tác mới: ${newPartner.code} - ${newPartner.name_vn}`,
  });

  await store.persistAsync();
  return c.json(newPartner, 201);
});

// PATCH /api/partners/:id (Admin Only)
partnersRouter.patch('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const parsed = parseInput(c, partnerInput.update, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { expected_revision, ...changes } = parsed.data as Record<string, any>;
  const conflict = revisionConflict(c, store.getPartner(id), expected_revision);
  if (conflict) return conflict;
  if (typeof changes.code === 'string') {
    changes.code = normalizePartnerCode(changes.code);
    if (!changes.code) return c.json({ error: 'Mã đối tác là bắt buộc', code: 'VALIDATION_FAILED', params: { fields: 'code' } }, 400);
    if (partnerCodeTaken(changes.code, id)) {
      return c.json({ error: `Mã đối tác '${changes.code}' đã tồn tại trong hệ thống`, code: 'PARTNER_CODE_TAKEN', params: { code: changes.code } }, 409);
    }
  }
  const updated = store.updatePartner(id, changes);
  if (!updated) {
    return c.json({ error: 'Partner not found', code: 'PARTNER_NOT_FOUND' }, 404);
  }
  const currentUser = getAuthUser(c)!;
  store.recordAuditLog({
    user_id: currentUser.id,
    username: currentUser.username,
    action: 'update',
    entity_type: 'partner',
    entity_id: id,
    entity_title: updated.name_vn,
    details: `Cập nhật đối tác: ${updated.code} - ${updated.name_vn}`,
  });
  await store.persistAsync();
  return c.json(updated);
});

// DELETE /api/partners/:id (Admin Only)
partnersRouter.delete('/:id', requireAdmin, async (c) => {
  const id = c.req.param('id') || '';
  const partner = store.getPartner(id);
  if (!partner) {
    return c.json({ error: 'Partner not found', code: 'PARTNER_NOT_FOUND' }, 404);
  }
  const conflict = revisionConflict(c, partner, c.req.query('expected_revision'));
  if (conflict) return conflict;

  const currentUser = getAuthUser(c)!;
  const success = Boolean(store.trashRecord('partner', id, currentUser.id));

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'delete',
    entity_type: 'partner',
    entity_id: id,
    entity_title: partner.name_vn,
    details: `Chuyển đối tác vào thùng rác: ${partner.code} - ${partner.name_vn}`,
  });

  await store.persistAsync();
  return c.json({ success, id });
});
