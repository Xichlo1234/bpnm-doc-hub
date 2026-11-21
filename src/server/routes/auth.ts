import { Hono, type Context, type Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { store } from '../db/store.ts';
import { RevisionConflictError } from '../db/repository.ts';
import { authInput, parseInput } from '../utils/validation.ts';
import { getDatabase, type SqlDatabase } from '../db/database.ts';
import type { UserAccount, UserRole } from '../types.ts';
import {
  getAuthSecret,
  signSessionToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  randomId,
} from '../utils/security.ts';

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  email: string;
  department?: string | null;
  status: 'active' | 'locked';
  can_access_labor_contracts?: boolean;
  can_access_confidential_documents?: boolean;
  must_change_password?: boolean;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: UserProfile | null;
  }
}

// 7-day token expiration
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// HttpOnly cookie carrying the same signed token. Only honoured for GET /api/files/* so that
// <img>/<iframe>/<a download> can load attachments; every other API call requires the Bearer header,
// which keeps the rest of the API immune to CSRF.
export const SESSION_COOKIE = 'sgii_session';
const SESSION_COOKIE_PATH = '/api/files';

// Seed passwords that shipped in source control. Logging in with one forces a password change, and a
// password change may not pick one of them.
export const KNOWN_DEFAULT_PASSWORDS = new Set(['Admin@6868', 'User@123456', '123456']);

// Per-session logout, stored in auth_revoked_sessions so it applies to every isolate. The local set
// only saves a query for sessions this isolate already knows are revoked.
const knownRevokedSessionIds = new Set<string>();

async function isSessionRevoked(db: SqlDatabase, sid: string): Promise<boolean> {
  if (knownRevokedSessionIds.has(sid)) return true;
  const row = await db.prepare('SELECT 1 AS x FROM auth_revoked_sessions WHERE sid = ?').bind(sid).first();
  if (row) knownRevokedSessionIds.add(sid);
  return Boolean(row);
}

async function revokeSession(db: SqlDatabase, sid: string, expiresAt: number) {
  knownRevokedSessionIds.add(sid);
  await db.batch([
    db.prepare('INSERT OR REPLACE INTO auth_revoked_sessions (sid, expires_at) VALUES (?, ?)').bind(sid, expiresAt),
    db.prepare('DELETE FROM auth_revoked_sessions WHERE expires_at < ?').bind(Date.now()),
  ]);
}

export function toUserProfile(account: UserAccount): UserProfile {
  return {
    id: account.id,
    username: account.username,
    name: account.name,
    role: account.role,
    email: account.email,
    department: account.department,
    status: account.status,
    can_access_labor_contracts: account.role === 'admin' || Boolean(account.can_access_labor_contracts),
    can_access_confidential_documents: account.role === 'admin' || Boolean(account.can_access_confidential_documents),
    must_change_password: Boolean(account.must_change_password),
  };
}

function extractBearerToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization');
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

type AccountState = Pick<UserAccount, 'status' | 'password' | 'revision' | 'token_version'>;

function matchesVerifiedState(current: AccountState | null, verified: AccountState): boolean {
  return current?.status === 'active' &&
    current.password === verified.password &&
    (current.revision ?? 0) === (verified.revision ?? 0) &&
    (current.token_version ?? 0) === (verified.token_version ?? 0);
}

async function issueSession(c: Context, db: SqlDatabase, account: UserAccount, secret: string): Promise<string | null> {
  const now = Date.now();
  const token = await signSessionToken(
    { sub: account.id, tv: account.token_version || 0, sid: randomId(), iat: now, exp: now + SESSION_DURATION_MS },
    secret
  );
  // Signing and other awaited work may overlap an account update. Check the committed row
  // and the live cache before publishing the token signed for the verified snapshot.
  const committed = await db.prepare('SELECT status, password, revision, token_version FROM users WHERE id = ?')
    .bind(account.id)
    .first<AccountState>();
  if (!matchesVerifiedState(committed, account) || !matchesVerifiedState(store.getUser(account.id), account)) return null;

  setCookie(c, SESSION_COOKIE, token, {
    path: SESSION_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'Strict',
    secure: new URL(c.req.url).protocol === 'https:',
    maxAge: SESSION_DURATION_MS / 1000,
  });
  return token;
}

function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: SESSION_COOKIE_PATH });
}

/** Resolves the user for a token. The account must still exist, be active and match token_version. */
async function resolveUser(token: string, secret: string, db: SqlDatabase): Promise<UserProfile | null> {
  const payload = await verifySessionToken(token, secret);
  if (!payload || (await isSessionRevoked(db, payload.sid))) return null;
  const account = store.getUser(payload.sub);
  if (!account || account.status !== 'active') return null;
  if ((account.token_version || 0) !== payload.tv) return null;
  return toUserProfile(account);
}

const PUBLIC_API_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/logout']);
// The only endpoints an account that must change its password can call.
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set(['/api/auth/me', '/api/auth/change-password']);

/**
 * Global API middleware: authenticates every /api/* request (except PUBLIC_API_PATHS) and stores
 * the user on the context. Route-level guards then only check roles.
 */
export async function authenticate(c: Context, next: Next) {
  const path = c.req.path;
  if (PUBLIC_API_PATHS.has(path)) {
    c.set('user', null);
    return next();
  }

  const secret = getAuthSecret(c.env);
  if (!secret) {
    console.error('AUTH_SECRET is not configured; refusing to authenticate requests.');
    return c.json({ error: 'Máy chủ chưa được cấu hình bảo mật (AUTH_SECRET).', code: 'SERVER_NOT_CONFIGURED' }, 500);
  }

  let token = extractBearerToken(c);
  const isFileRead = path.startsWith('/api/files/') && (c.req.method === 'GET' || c.req.method === 'HEAD');
  if (!token && isFileRead) {
    token = getCookie(c, SESSION_COOKIE) || null;
  }

  const user = token ? await resolveUser(token, secret, await getDatabase(c.env)) : null;
  if (!user) {
    return c.json({ error: 'Yêu cầu đăng nhập để thực hiện thao tác này.', code: 'AUTH_REQUIRED' }, 401);
  }

  if (user.must_change_password && !PASSWORD_CHANGE_ALLOWED_PATHS.has(path)) {
    return c.json(
      { error: 'Bạn cần đổi mật khẩu khởi tạo trước khi sử dụng hệ thống.', code: 'PASSWORD_CHANGE_REQUIRED' },
      403
    );
  }

  c.set('user', user);
  await next();
}

// Returns the user authenticated by the global `authenticate` middleware.
export function getAuthUser(c: Context): UserProfile | null {
  return c.get('user') ?? null;
}

// Middleware: Require valid login
export async function requireAuth(c: Context, next: Next) {
  if (!getAuthUser(c)) {
    return c.json({ error: 'Yêu cầu đăng nhập để thực hiện thao tác này.', code: 'AUTH_REQUIRED' }, 401);
  }
  await next();
}

// Middleware: Require Admin role for modification / administration
export async function requireAdmin(c: Context, next: Next) {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Yêu cầu đăng nhập.', code: 'AUTH_REQUIRED' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Truy cập bị từ chối: Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này.', code: 'ADMIN_ONLY' }, 403);
  }
  await next();
}

// ---------------------------------------------------------------------------
// Login throttling: 5 failures per (IP, username) within 15 minutes → locked out for the window.
// Counters live in auth_login_failures so they hold across isolates.
// ---------------------------------------------------------------------------
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginThrottleKey(c: Context, username: string): string {
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0].trim() || 'local';
  return `${ip}|${username.toLowerCase()}`;
}

async function isLoginThrottled(db: SqlDatabase, key: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT count, first_at FROM auth_login_failures WHERE key = ?')
    .bind(key)
    .first<{ count: number; first_at: number }>();
  if (!row || Date.now() - row.first_at > LOGIN_WINDOW_MS) return false;
  return row.count >= MAX_LOGIN_FAILURES;
}

async function recordLoginFailure(db: SqlDatabase, key: string) {
  const now = Date.now();
  const windowStart = now - LOGIN_WINDOW_MS;
  // Starts a new window when the previous one has expired
  await db
    .prepare(
      `INSERT INTO auth_login_failures (key, count, first_at) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN first_at < ?3 THEN 1 ELSE count + 1 END,
         first_at = CASE WHEN first_at < ?3 THEN ?2 ELSE first_at END`
    )
    .bind(key, now, windowStart)
    .run();
}

async function clearLoginFailures(db: SqlDatabase, key: string) {
  await db.prepare('DELETE FROM auth_login_failures WHERE key = ?').bind(key).run();
}

export async function resetLoginThrottle() {
  const db = await getDatabase();
  await db.prepare('DELETE FROM auth_login_failures').run();
}

let dummyHash: Promise<string> | null = null;
function dummyPasswordHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(randomId(24));
  return dummyHash;
}

export const authRouter = new Hono();

// POST /api/auth/login
authRouter.post('/login', async (c) => {
  const parsed = authInput.login.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.', code: 'CREDENTIALS_REQUIRED' }, 400);
  }
  const { username, password } = parsed.data;

  const secret = getAuthSecret(c.env);
  if (!secret) {
    console.error('AUTH_SECRET is not configured; login disabled.');
    return c.json({ error: 'Máy chủ chưa được cấu hình bảo mật (AUTH_SECRET).', code: 'SERVER_NOT_CONFIGURED' }, 500);
  }

  const trimmedUser = String(username).trim();
  const db = await getDatabase(c.env);
  const throttleKey = loginThrottleKey(c, trimmedUser);
  if (await isLoginThrottled(db, throttleKey)) {
    return c.json({ error: 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.', code: 'TOO_MANY_ATTEMPTS' }, 429);
  }

  // Verification and the account update it may trigger (rehash of a legacy password, forcing a
  // change of a published default password) must agree with the committed account row. If another
  // worker changes the account in between (password reset, lock, session revocation via
  // token_version), the batch is refused (RevisionConflictError); then everything is re-done from
  // the reloaded row — the password is verified again against the *new* hash, the status re-checked —
  // and no token is ever issued from the earlier verification.
  for (let attempt = 0; attempt < 2; attempt++) {
    const account = store.getUserByUsername(trimmedUser);
    // Unknown usernames still pay for a PBKDF2 run so response time does not reveal which exist
    const { ok, needsRehash } = await verifyPassword(password, account?.password ?? (await dummyPasswordHash()));
    if (!account || !ok) {
      await recordLoginFailure(db, throttleKey);
      return c.json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.', code: 'INVALID_CREDENTIALS' }, 401);
    }
    if (account.status === 'locked') {
      return c.json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên.', code: 'ACCOUNT_LOCKED' }, 403);
    }
    const usesDefaultPassword = KNOWN_DEFAULT_PASSWORDS.has(password);
    const newHash = needsRehash ? await hashPassword(password) : null;
    if (!matchesVerifiedState(store.getUser(account.id), account)) continue;

    let verified = account;
    if (newHash || (usesDefaultPassword && !account.must_change_password)) {
      const updated = store.updateUser(account.id, {
        ...(newHash ? { password: newHash } : {}),
        ...(usesDefaultPassword ? { must_change_password: true } : {}),
      });
      if (!updated) continue;
      try {
        await store.persistAsync();
      } catch (err) {
        if (!(err instanceof RevisionConflictError)) throw err;
        await store.sync(db, (c.env as any)?.DB ? 'd1' : 'json');
        continue;
      }
      verified = updated;
    }

    await clearLoginFailures(db, throttleKey);
    const token = await issueSession(c, db, verified, secret);
    if (!token) {
      await store.sync(db, (c.env as any)?.DB ? 'd1' : 'json');
      continue;
    }

    const userProfile = toUserProfile(verified);
    store.recordAuditLog({
      user_id: userProfile.id,
      username: userProfile.username,
      action: 'login',
      entity_type: 'auth',
      details: `Đăng nhập thành công với vai trò ${userProfile.role}`,
    });
    return c.json({ token, user: userProfile });
  }
  return c.json({ error: 'Tài khoản vừa được cập nhật. Vui lòng đăng nhập lại.', code: 'LOGIN_RETRY' }, 409);
});

// GET /api/auth/me
authRouter.get('/me', async (c) => {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Phiên làm việc không hợp lệ hoặc đã hết hạn.', code: 'SESSION_INVALID' }, 401);
  }
  // Re-issue the file-download cookie for sessions that predate it or whose cookie was cleared.
  const token = extractBearerToken(c);
  if (token) {
    setCookie(c, SESSION_COOKIE, token, {
      path: SESSION_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'Strict',
      secure: new URL(c.req.url).protocol === 'https:',
      maxAge: SESSION_DURATION_MS / 1000,
    });
  }
  return c.json({ user });
});

// POST /api/auth/change-password
authRouter.post('/change-password', async (c) => {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ error: 'Yêu cầu đăng nhập.', code: 'AUTH_REQUIRED' }, 401);
  }
  const secret = getAuthSecret(c.env)!;
  const parsed = parseInput(c, authInput.changePassword, await c.req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { current_password, new_password } = parsed.data;

  const account = store.getUser(user.id);
  if (!account) {
    return c.json({ error: 'Không tìm thấy người dùng', code: 'USER_NOT_FOUND' }, 404);
  }
  const { ok } = await verifyPassword(String(current_password || ''), account.password);
  if (!ok) {
    return c.json({ error: 'Mật khẩu hiện tại không chính xác.', code: 'CURRENT_PASSWORD_WRONG' }, 400);
  }
  const weakness = validatePasswordStrength(new_password);
  if (weakness) {
    return c.json({ error: weakness.message, code: weakness.code, params: weakness.params }, 400);
  }
  if (new_password === current_password || KNOWN_DEFAULT_PASSWORDS.has(new_password)) {
    return c.json({ error: 'Vui lòng chọn mật khẩu mới khác mật khẩu hiện tại/mặc định.', code: 'PASSWORD_REUSE' }, 400);
  }

  const db = await getDatabase(c.env);
  const newHash = await hashPassword(new_password);
  if (!matchesVerifiedState(store.getUser(account.id), account)) throw new RevisionConflictError();

  store.queueGuard((db) => db.prepare(
    `INSERT INTO write_guard (conflict)
     SELECT 1 WHERE NOT EXISTS (
       SELECT 1 FROM users WHERE id = ? AND status = 'active' AND password IS ?
         AND COALESCE(revision, 0) = ? AND COALESCE(token_version, 0) = ?
     )`,
  ).bind(account.id, account.password ?? null, account.revision ?? 0, account.token_version ?? 0));
  const updated = store.updateUser(account.id, {
    password: newHash,
    must_change_password: false,
    token_version: (account.token_version || 0) + 1,
  })!;
  store.recordAuditLog({
    user_id: user.id,
    username: user.username,
    action: 'update',
    entity_type: 'user',
    entity_id: user.id,
    entity_title: user.username,
    details: 'Đổi mật khẩu',
  });
  await store.persistAsync();

  // Every other session was revoked by the token_version bump; hand this one a fresh token.
  const token = await issueSession(c, db, updated, secret);
  if (!token) {
    return c.json({ error: 'Tài khoản vừa được cập nhật. Vui lòng đăng nhập lại.', code: 'LOGIN_RETRY' }, 409);
  }
  return c.json({ token, user: toUserProfile(updated) });
});

// POST /api/auth/logout
authRouter.post('/logout', async (c) => {
  const token = extractBearerToken(c);
  const secret = getAuthSecret(c.env);
  if (token && secret) {
    const payload = await verifySessionToken(token, secret);
    if (payload) await revokeSession(await getDatabase(c.env), payload.sid, payload.exp);
  }
  clearSessionCookie(c);
  return c.json({ success: true });
});
