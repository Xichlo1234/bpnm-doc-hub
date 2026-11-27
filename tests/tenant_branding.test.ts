import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app, brandingFrom } from '../src/server/index.ts';

describe('per-tenant branding (/api/branding)', () => {
  afterEach(() => {
    delete process.env.APP_TITLE;
    delete process.env.APP_TAB_TITLE;
    delete process.env.MAINTENANCE_MODE;
  });

  it('returns nulls when the Worker sets no name, so the client keeps the built-in BPNM name', async () => {
    const res = await app.request('/api/branding');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: null, tabTitle: null });
  });

  it('serves the configured name without a session', async () => {
    process.env.APP_TITLE = 'SGII Doc Hub';
    process.env.APP_TAB_TITLE = 'SGII';
    const res = await app.request('/api/branding');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.json()).toEqual({ title: 'SGII Doc Hub', tabTitle: 'SGII' });
  });

  it('still answers in maintenance mode while business APIs are closed', async () => {
    process.env.MAINTENANCE_MODE = '1';
    process.env.APP_TITLE = 'SGII Doc Hub';
    expect((await app.request('/api/branding')).status).toBe(200);
    expect((await app.request('/api/documents')).status).toBe(503);
  });

  it('prefers Worker bindings and rejects blank or oversized values', () => {
    expect(brandingFrom({ APP_TITLE: '  SGII Doc Hub ', APP_TAB_TITLE: 'SGII' })).toEqual({ title: 'SGII Doc Hub', tabTitle: 'SGII' });
    expect(brandingFrom({ APP_TITLE: '   ', APP_TAB_TITLE: 'x'.repeat(61) })).toEqual({ title: null, tabTitle: null });
    expect(brandingFrom({ APP_TITLE: 42 })).toEqual({ title: null, tabTitle: null });
  });

  it('wrangler.jsonc names document-manage SGII and leaves the BPNM top level on the built-in name', () => {
    const cfg = fs.readFileSync(path.join(process.cwd(), 'wrangler.jsonc'), 'utf-8');
    const envStart = cfg.indexOf('"env"');
    expect(envStart).toBeGreaterThan(-1);
    expect(cfg.slice(0, envStart)).not.toMatch(/APP_TITLE/);
    expect(cfg.slice(envStart)).toMatch(/"APP_TITLE":\s*"SGII Doc Hub"/);
    expect(cfg.slice(envStart)).toMatch(/"APP_TAB_TITLE":\s*"SGII"/);
  });
});
