import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { getAuthUser } from './auth.ts';
import { canReadContract, canReadDocument } from '../utils/access.ts';

export const searchRouter = new Hono();

// GET /api/search?q=keyword
searchRouter.get('/', (c) => {
  const q = c.req.query('q') || '';
  const results: any = store.searchAll(q);
  const currentUser = getAuthUser(c);
  results.documents = (results.documents || []).filter((d: any) => canReadDocument(currentUser, d));
  results.contracts = (results.contracts || []).filter((ct: any) => canReadContract(currentUser, ct));
  return c.json(results);
});
