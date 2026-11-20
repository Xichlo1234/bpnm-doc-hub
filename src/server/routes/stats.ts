import { Hono } from 'hono';
import { store } from '../db/store.ts';
import { getAuthUser } from './auth.ts';
import { canAccessLaborContracts } from '../types.ts';

export const statsRouter = new Hono();

// GET /api/stats
statsRouter.get('/', (c) => {
  const stats = store.getStats();
  const currentUser = getAuthUser(c);
  if (!canAccessLaborContracts(currentUser)) {
    return c.json({
      ...stats,
      totalLaborContracts: 0,
      laborActiveCount: 0,
      laborUrgentCount: 0,
      laborWarningCount: 0,
      laborExpiredCount: 0,
      laborLiquidatedCount: 0,
      laborIndefiniteCount: 0,
    });
  }
  return c.json(stats);
});
