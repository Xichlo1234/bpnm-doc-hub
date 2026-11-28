import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { app } from '../src/server/index';

const root = path.resolve(__dirname, '..');
const hosts = { bpnm: 'bpnm.tungcv.vn', 'document-manage': 'document-manage.tungcv.vn' };
describe.each(Object.entries(hosts))('Gói Android của %s', (id, host) => {
  const dir = path.join(root, 'android', id);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'twa-manifest.json'), 'utf8'));
  const release = JSON.parse(readFileSync(path.join(dir, 'release.json'), 'utf8'));
  const apk = readFileSync(path.join(dir, release.file));
  const env = {
    ANDROID_TENANT: id,
    ASSETS: {
      fetch: async (request: Request) =>
        new URL(request.url).pathname === '/downloads/android.apk'
          ? new Response(new Uint8Array(apk), { headers: { 'Content-Type': 'application/octet-stream' } })
          : new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    },
  };
  const request = (route: string, init?: RequestInit) =>
    app.fetch(new Request('https://' + host + route, init), env);

  it('công khai đúng một package và chứng thư, kể cả khi điều hướng từ trình duyệt', async () => {
    const response = await request('/.well-known/assetlinks.json', { headers: { Accept: 'text/html' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(release.certificate).toBe(manifest.fingerprints[0].value);
    expect(await response.json()).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: release.packageName,
          sha256_cert_fingerprints: [release.certificate],
        },
      },
    ]);
  });
  it('trả APK đúng MIME, tên, phiên bản và dữ liệu đã ký', async () => {
    const meta = await (await request('/downloads/android.json')).json();
    expect(meta).toEqual({ href: '/downloads/android.apk', bytes: apk.length, version: manifest.appVersion });
    expect(manifest.appVersionCode).toBe(release.versionCode);
    expect(manifest.packageId).toBe(release.packageName);
    const res = await request('/downloads/android.apk');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.android.package-archive');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="' + id + '.apk"');
    expect(
      createHash('sha256')
        .update(new Uint8Array(await res.arrayBuffer()))
        .digest('hex')
    ).toBe(release.sha256);
    expect((await request('/downloads/android.apk', { method: 'HEAD' })).body).toBeNull();
  });
  it.each(['/.well-known/assetlinks.json', '/downloads/android.json', '/downloads/android.apk'])(
    'từ chối host không khớp %s',
    async (route) => {
      const other = id === 'bpnm' ? hosts['document-manage'] : hosts.bpnm;
      expect((await app.fetch(new Request('https://' + other + route), env)).status).toBe(404);
    }
  );
  it('từ chối trang HTML khi thiếu binary trong ASSETS', async () => {
    const response = await app.fetch(new Request('https://' + host + '/downloads/android.apk'), {
      ...env,
      ASSETS: { fetch: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }) },
    });
    expect(response.status).toBe(404);
  });
});
