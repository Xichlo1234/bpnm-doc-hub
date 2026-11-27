import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { documentsRouter } from './routes/documents.ts';
import { contractsRouter } from './routes/contracts.ts';
import { searchRouter } from './routes/search.ts';
import { statsRouter } from './routes/stats.ts';
import { filesRouter } from './routes/files.ts';
import { partnersRouter } from './routes/partners.ts';
import { categoriesRouter } from './routes/categories.ts';
import { authRouter, authenticate } from './routes/auth.ts';
import { notificationsRouter } from './routes/notifications.ts';
import { usersRouter } from './routes/users.ts';
import { auditRouter } from './routes/audit.ts';
import { attachmentsRouter } from './routes/attachments.ts';
import { trashRouter } from './routes/trash.ts';
import { historyRouter } from './routes/history.ts';
import { adminRouter } from './routes/admin.ts';
import { importsRouter } from './routes/imports.ts';
import { store } from './db/store.ts';
import { getDatabase } from './db/database.ts';
import { DatabaseNotMigratedError, CommitOutcomeUnknownError, RevisionConflictError, NumberConflictError, FileRetiredError, UsernameTakenError, PartnerCodeTakenError } from './db/repository.ts';
import { UploadValidationError } from './utils/fileStorage.ts';

export const app = new Hono();

// No CORS middleware: the SPA is served from the same origin as the API, so cross-origin
// access is intentionally not allowed.

// Per-tenant display name. The same build serves several organisations (see docs/ops/RELEASE_FLOW.md);
// each Worker sets APP_TITLE / APP_TAB_TITLE as plain vars in its wrangler env. Unset or invalid values
// return null and the client keeps its built-in name.
const BRAND_MAX_LENGTH = 60;
export function brandingFrom(env: unknown): { title: string | null; tabTitle: string | null } {
  const vars = (env ?? {}) as Record<string, unknown>;
  const read = (name: string) => {
    const raw = vars[name] ?? (typeof process !== 'undefined' ? process.env?.[name] : undefined);
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    return value && value.length <= BRAND_MAX_LENGTH ? value : null;
  };
  return { title: read('APP_TITLE'), tabTitle: read('APP_TAB_TITLE') };
}

// Registered before every other /api middleware: public, never touches the database, and still answers
// in maintenance mode so the shell shows the right name on the maintenance screen.
app.get('/api/branding', (c) =>
  withSecurityHeaders(c.json(brandingFrom(c.env), 200, { 'Cache-Control': 'no-store' }))
);

// Maintenance mode (MAINTENANCE_MODE=1 as a Worker variable): every API call except the health check
// answers 503 without touching the database. This is the safe alternative to rolling back to a build
// older than the security hardening (see docs/ops/DEPLOY_RUNBOOK.md, "Rollback").
app.use('/api/*', async (c, next) => {
  const flag = (c.env as any)?.MAINTENANCE_MODE ?? (typeof process !== 'undefined' ? process.env?.MAINTENANCE_MODE : undefined);
  if (String(flag ?? '') === '1') {
    if (c.req.path === '/api/health' && (c.req.method === 'GET' || c.req.method === 'HEAD')) {
      return withSecurityHeaders(healthResponse(c));
    }
    return c.json({ error: 'Hệ thống đang bảo trì. Vui lòng thử lại sau.', code: 'MAINTENANCE' }, 503);
  }
  await next();
});

// Request size cap: uploads are ≤5MB and Excel imports ≤5,000 rows, so 12MB is ample. Bigger bodies are
// refused before they are read or validated.
export const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
app.use(
  '/api/*',
  bodyLimit({
    maxSize: MAX_REQUEST_BYTES,
    onError: (c) => c.json({ error: 'Dữ liệu gửi lên quá lớn.', code: 'PAYLOAD_TOO_LARGE' }, 413),
  })
);

// Database middleware: refreshes the in-memory cache before the request (if another isolate wrote)
// and commits this request's changes after it. See MemoryStore in db/store.ts.
app.use('/api/*', async (c, next) => {
  // Prevent browser & CDN caching of API JSON responses so F5 always loads fresh state (skip for binary file streaming)
  if (!c.req.path.startsWith('/api/files/')) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
  }

  const env = c.env as any;
  const db = await getDatabase(env);
  await store.runRequest(async () => {
    try {
      await store.sync(db, env?.DB ? 'd1' : 'json');
      await next();
      if (c.res.status >= 400) store.discardPending();
      else await store.flush(db);
    } catch (error) {
      store.discardPending();
      throw error;
    }
  });
});

// Browser hardening for every response. The CSP allows only same-origin scripts; inline styles are
// used throughout the React components, and Google Fonts serves the web fonts.
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'self' blob:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

function withSecurityHeaders(res: Response): Response {
  // Responses from fetch()/ASSETS have immutable headers; copy once
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // File downloads set their own stricter CSP (sandbox) for active content
    if (name === 'Content-Security-Policy' && out.headers.has(name)) continue;
    out.headers.set(name, value);
  }
  return out;
}

app.use('*', async (c, next) => {
  await next();
  c.res = withSecurityHeaders(c.res);
});

// Every API route requires a signed session except login/logout/health (see auth.ts)
app.use('/api/*', authenticate);

function healthResponse(c: Context) {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
}

app.get('/api/health', healthResponse);

// Mount API subrouters
app.route('/api/auth', authRouter);
app.route('/api/users', usersRouter);
app.route('/api/audit-logs', auditRouter);
app.route('/api/documents', documentsRouter);
app.route('/api/contracts', contractsRouter);
app.route('/api/partners', partnersRouter);
app.route('/api/categories', categoriesRouter);
app.route('/api/notifications', notificationsRouter);
app.route('/api/search', searchRouter);
app.route('/api/stats', statsRouter);
app.route('/api/files', filesRouter);
app.route('/api/attachments', attachmentsRouter);
app.route('/api/trash', trashRouter);
app.route('/api/history', historyRouter);
app.route('/api/admin', adminRouter);
app.route('/api/imports', importsRouter);

app.onError((err, c) => {
  if (err instanceof UploadValidationError) {
    return c.json({ error: err.message, code: err.code, params: err.params }, 400);
  }
  if (err instanceof PartnerCodeTakenError) {
    return c.json({ error: 'Mã đối tác đã được dùng cho đối tác khác.', code: 'PARTNER_CODE_TAKEN', params: { code: '' } }, 409);
  }
  if (err instanceof UsernameTakenError) {
    return c.json({ error: 'Tên đăng nhập đã tồn tại trong hệ thống', code: 'USERNAME_TAKEN' }, 409);
  }
  if (err instanceof FileRetiredError) {
    return c.json({ error: 'Tệp đã bị gỡ khỏi hệ thống, không thể gắn lại.', code: 'FILE_RETIRED' }, 409);
  }
  if (err instanceof NumberConflictError) {
    return c.json(
      { error: 'Số văn bản/hợp đồng đã được sử dụng.', code: 'RECORD_NUMBER_TAKEN', params: { number: err.number || '' } },
      409
    );
  }
  if (err instanceof RevisionConflictError) {
    return c.json(
      {
        error: 'Hồ sơ đã được người khác cập nhật trong lúc bạn chỉnh sửa. Vui lòng mở lại để xem bản mới nhất rồi sửa lại.',
        code: 'REVISION_CONFLICT',
      },
      409
    );
  }
  if (err instanceof CommitOutcomeUnknownError) {
    console.error('Commit outcome unknown:', err.cause);
    // Not a failure: the change may be saved. Clients reload before deciding; only a create with
    // the same Idempotency-Key may be resent (it resolves to the record already created).
    return c.json(
      {
        error: 'Chưa xác nhận được kết quả lưu: thay đổi có thể đã được ghi. Vui lòng tải lại để kiểm tra trước khi thao tác lại.',
        code: 'COMMIT_OUTCOME_UNKNOWN',
        outcome: 'unknown',
      },
      503
    );
  }
  if (err instanceof DatabaseNotMigratedError) {
    console.error(err.message);
    return c.json({ error: 'Cơ sở dữ liệu chưa được nâng cấp. Vui lòng liên hệ quản trị viên để kiểm tra cấu hình triển khai.', code: 'DB_NOT_MIGRATED' }, 503);
  }
  console.error('Unhandled API error:', err);
  return c.json({ error: 'Lỗi máy chủ nội bộ.', code: 'INTERNAL_ERROR' }, 500);
});

// Fallback for static assets in Cloudflare Workers
app.all('*', async (c) => {
  const env = c.env as { ASSETS?: { fetch: (req: Request) => Promise<Response> } };
  if (env?.ASSETS) {
    return env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not found', 404);
});

// Export default for Cloudflare Worker entrypoint
export default app;
