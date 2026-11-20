import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { requireAdmin, getAuthUser } from './auth.ts';
import { configInput, parseInput } from '../utils/validation.ts';

export const categoriesRouter = new Hono();

// GET /api/categories
categoriesRouter.get('/', (c) => {
  return c.json(store.getCategories());
});

// GET /api/categories/settings
categoriesRouter.get('/settings', (c) => {
  return c.json(store.getSettings());
});

// GET /api/categories/currencies (Publicly accessible for dropdowns/formatting)
categoriesRouter.get('/currencies', (c) => {
  return c.json(store.getCurrencies());
});

// PUT /api/categories/currencies (Admin Only)
categoriesRouter.put('/currencies', requireAdmin, async (c) => {
  const parsed = parseInput(c, configInput.currencies, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const currentUser = getAuthUser(c);
  const updated = store.setCurrencies(parsed.data);

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'update',
    entity_type: 'category',
    details: 'Cập nhật danh mục đơn vị tiền tệ hệ thống',
  });

  await store.persistAsync();
  return c.json(updated);
});

// POST /api/categories/currencies (Admin Only - Add or update a single currency)
categoriesRouter.post('/currencies', requireAdmin, async (c) => {
  const parsed = parseInput(c, configInput.currency, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const currentUser = getAuthUser(c);
  const updated = store.addCurrency({
    code: String(body.code).trim().toUpperCase(),
    name: String(body.name).trim(),
    symbol: body.symbol || body.code,
    decimals: body.decimals !== undefined ? Number(body.decimals) : 2,
    active: body.active !== undefined ? Boolean(body.active) : true,
    is_default: Boolean(body.is_default),
  });

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'create',
    entity_type: 'category',
    details: `Thêm/cập nhật đơn vị tiền tệ: ${body.code}`,
  });

  await store.persistAsync();
  return c.json(updated, 201);
});

// PATCH /api/categories/settings (Admin Only)
categoriesRouter.patch('/settings', requireAdmin, async (c) => {
  const parsed = parseInput(c, configInput.settings, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const currentUser = getAuthUser(c);
  const updated = store.updateSettings(parsed.data);

  store.recordAuditLog({
    user_id: currentUser?.id || 'admin',
    username: currentUser?.username || 'admin',
    action: 'update',
    entity_type: 'category',
    details: 'Cập nhật cài đặt chung hệ thống',
  });

  await store.persistAsync();
  return c.json(updated);
});

// POST /api/categories/:type (Admin Only)
categoriesRouter.post('/:type', requireAdmin, async (c) => {
  const typeParsed = parseInput(c, configInput.categoryType, c.req.param('type'));
  if (!typeParsed.ok) return typeParsed.response;
  const body = await c.req.json().catch(() => ({}));
  const itemParsed = parseInput(c, configInput.categoryItem, body?.item !== undefined ? body.item : body);
  if (!itemParsed.ok) return itemParsed.response;
  const list = store.addCategoryItem(typeParsed.data, itemParsed.data);
  await store.persistAsync();
  return c.json(list, 201);
});

// PATCH /api/categories/:type/:index (Admin Only)
categoriesRouter.patch('/:type/:index', requireAdmin, async (c) => {
  const typeParsed = parseInput(c, configInput.categoryType, c.req.param('type'));
  if (!typeParsed.ok) return typeParsed.response;
  const index = parseInt(c.req.param('index') || '0', 10);
  const body = await c.req.json().catch(() => ({}));
  const itemParsed = parseInput(c, configInput.categoryItem, body?.item !== undefined ? body.item : body);
  if (!itemParsed.ok) return itemParsed.response;
  const updated = store.updateCategoryItem(typeParsed.data, index, itemParsed.data);
  if (!updated) {
    return c.json({ error: 'Item not found', code: 'CATEGORY_ITEM_NOT_FOUND' }, 404);
  }
  await store.persistAsync();
  return c.json(updated);
});

// DELETE /api/categories/:type/:index (Admin Only)
categoriesRouter.delete('/:type/:index', requireAdmin, async (c) => {
  const typeParsed = parseInput(c, configInput.categoryType, c.req.param('type'));
  if (!typeParsed.ok) return typeParsed.response;
  const type = typeParsed.data;
  const index = parseInt(c.req.param('index') || '0', 10);
  const success = store.deleteCategoryItem(type, index);
  if (!success) {
    return c.json({ error: 'Item not found', code: 'CATEGORY_ITEM_NOT_FOUND' }, 404);
  }
  await store.persistAsync();
  return c.json({ success, type, index });
});
