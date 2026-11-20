import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { getAuthUser } from './auth.ts';
import { isLaborContract, canAccessLaborContracts } from '../types.ts';

export const searchRouter = new Hono();

// GET /api/search?q=keyword
searchRouter.get('/', (c) => {
  const q = c.req.query('q') || '';
  const results = store.searchAll(q);
  const currentUser = getAuthUser(c);
  if (!canAccessLaborContracts(currentUser) && Array.isArray(results.contracts)) {
    results.contracts = results.contracts.filter((ct: any) => !isLaborContract(ct));
  }
  return c.json(results);
});
