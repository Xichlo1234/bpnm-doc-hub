import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { getAuthUser } from './auth.ts';

export const statsRouter = new Hono();

// GET /api/stats — computed only over the records this user may read (confidential documents and
// labor contracts are left out for users without access, so counts never reveal they exist)
statsRouter.get('/', (c) => {
  return c.json(store.getStats(getAuthUser(c)));
});
