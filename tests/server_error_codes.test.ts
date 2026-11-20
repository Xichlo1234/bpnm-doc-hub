import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { translations, serverErrorMessage, SERVER_ERROR_KEYS } from '../src/client/src/i18n/index.ts';
import { validatePasswordStrength } from '../src/server/utils/security.ts';
import { UploadValidationError, validateUpload } from '../src/server/utils/fileStorage.ts';

const SERVER_DIR = path.resolve(__dirname, '../src/server');

function serverSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return serverSources(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

// Codes the server can send: literal `code: 'X'` next to an error, plus the typed unions in utils.
function codesInServer(): Set<string> {
  const codes = new Set<string>();
  for (const file of serverSources(SERVER_DIR)) {
    const text = fs.readFileSync(file, 'utf-8');
    for (const m of text.matchAll(/error: [^\n]*?code: (?:[^'\n]*\? undefined : )?'([A-Z_]+)'/g)) codes.add(m[1]);
    for (const m of text.matchAll(/^\s+code: '([A-Z_]+)',$/gm)) codes.add(m[1]);
  }
  return codes;
}

describe('server error codes', () => {
  it('every code the server sends has a translation', () => {
    const codes = codesInServer();
    expect(codes.size).toBeGreaterThan(30);
    const missing = [...codes].filter((code) => !SERVER_ERROR_KEYS[code]);
    expect(missing).toEqual([]);
  });

  it('codes raised from utils are mapped too', () => {
    expect(SERVER_ERROR_KEYS[validatePasswordStrength('short')!.code]).toBeTruthy();
    expect(SERVER_ERROR_KEYS[validatePasswordStrength('longbutnodigits')!.code]).toBeTruthy();
    for (const file of [{ name: 'a.exe', size: 1 }, { name: 'a.pdf', size: 10 * 1024 * 1024 }]) {
      try {
        validateUpload(file);
        throw new Error('expected validateUpload to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UploadValidationError);
        expect(SERVER_ERROR_KEYS[(err as UploadValidationError).code]).toBeTruthy();
      }
    }
  });

  it('translates known codes with params and falls back to the server text otherwise', () => {
    expect(serverErrorMessage(translations.en, { error: 'x', code: 'INVALID_CREDENTIALS' }, 'f')).toBe('Incorrect username or password.');
    expect(serverErrorMessage(translations.en, { error: 'x', code: 'PASSWORD_TOO_SHORT', params: { min: 8 } }, 'f')).toBe(
      'The password must be at least 8 characters long.'
    );
    expect(serverErrorMessage(translations.km, { error: 'x', code: 'PARTNER_CODE_TAKEN', params: { code: 'ABC' } }, 'f')).toContain('ABC');
    expect(serverErrorMessage(translations.en, { error: 'Server text', code: 'SOMETHING_NEW' }, 'f')).toBe('Server text');
    expect(serverErrorMessage(translations.en, {}, 'fallback')).toBe('fallback');
    expect(serverErrorMessage(translations.en, null, 'fallback')).toBe('fallback');
  });
});
