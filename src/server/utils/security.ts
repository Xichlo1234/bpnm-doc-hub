// Cryptographic helpers built on Web Crypto so they run identically on Cloudflare Workers and Node.

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str: string): Uint8Array<ArrayBuffer> {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomId(byteLength = 16): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

// ---------------------------------------------------------------------------
// Auth secret
// ---------------------------------------------------------------------------

// Local dev / tests run in a single Node process, so a per-process random secret is fine there.
// Kept on globalThis so Vite's SSR module reloads don't invalidate every session.
function getDevSecret(): string {
  const g = globalThis as any;
  if (!g.__sgiiDevAuthSecret) g.__sgiiDevAuthSecret = randomId(32);
  return g.__sgiiDevAuthSecret;
}

/**
 * Returns the HMAC secret for session tokens, or null when the deployment is misconfigured.
 * On Cloudflare (DB/ASSETS bindings present) AUTH_SECRET is mandatory: we fail closed rather than
 * fall back to a per-isolate secret that would silently log users out between isolates.
 */
export function getAuthSecret(env?: any): string | null {
  const fromEnv = env?.AUTH_SECRET || (typeof process !== 'undefined' ? process.env?.AUTH_SECRET : undefined);
  if (fromEnv) return String(fromEnv);
  const isCloudflare = Boolean(env?.DB || env?.ASSETS);
  return isCloudflare ? null : getDevSecret();
}

// ---------------------------------------------------------------------------
// Signed session tokens (HMAC-SHA256)
// ---------------------------------------------------------------------------

export interface SessionTokenPayload {
  sub: string; // user id
  tv: number; // user token_version at issue time; bumping it revokes all tokens of that user
  sid: string; // session id, used for per-session logout
  iat: number;
  exp: number;
}

const TOKEN_PREFIX = 'sgii2';
const keyCache = new Map<string, Promise<CryptoKey>>();

function getHmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

export async function signSessionToken(payload: SessionTokenPayload, secret: string): Promise<string> {
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${TOKEN_PREFIX}.${body}`;
  const sig = await crypto.subtle.sign('HMAC', await getHmacKey(secret), encoder.encode(signingInput));
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionTokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  try {
    // crypto.subtle.verify compares in constant time
    const valid = await crypto.subtle.verify(
      'HMAC',
      await getHmacKey(secret),
      base64UrlToBytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as SessionTokenPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256)
// ---------------------------------------------------------------------------

// Cloudflare Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;
const HASH_PREFIX = 'pbkdf2';

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256);
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function isPasswordHash(stored?: string | null): boolean {
  return typeof stored === 'string' && stored.startsWith(`${HASH_PREFIX}$`);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

/**
 * Verifies a password against a stored PBKDF2 hash. Legacy plaintext values (from before hashing
 * was introduced) are still accepted once so they can be upgraded; `needsRehash` signals that.
 */
export async function verifyPassword(
  password: string,
  stored?: string | null
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored) return { ok: false, needsRehash: false };
  if (!isPasswordHash(stored)) {
    const ok = timingSafeEqual(encoder.encode(password), encoder.encode(stored));
    return { ok, needsRehash: ok };
  }
  const [, iterStr, saltStr, hashStr] = stored.split('$');
  const iterations = Number(iterStr);
  if (!iterations || !saltStr || !hashStr) return { ok: false, needsRehash: false };
  const actual = await pbkdf2(password, base64UrlToBytes(saltStr), iterations);
  const ok = timingSafeEqual(actual, base64UrlToBytes(hashStr));
  return { ok, needsRehash: ok && iterations < PBKDF2_ITERATIONS };
}

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordWeakness {
  code: 'PASSWORD_TOO_SHORT' | 'PASSWORD_NEEDS_LETTERS_AND_DIGITS';
  /** Vietnamese message; clients translate by `code`. */
  message: string;
  params?: { min: number };
}

/** Describes why the password is too weak, or returns null when it is acceptable. */
export function validatePasswordStrength(password: unknown): PasswordWeakness | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return {
      code: 'PASSWORD_TOO_SHORT',
      message: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
      params: { min: MIN_PASSWORD_LENGTH },
    };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { code: 'PASSWORD_NEEDS_LETTERS_AND_DIGITS', message: 'Mật khẩu phải chứa cả chữ và số.' };
  }
  return null;
}
