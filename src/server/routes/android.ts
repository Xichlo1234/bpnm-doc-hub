import { Hono } from 'hono';
import bpnm from '../../../android/bpnm/release.json';
import documentManage from '../../../android/document-manage/release.json';
import bpnmManifest from '../../../android/bpnm/twa-manifest.json';
import documentManifest from '../../../android/document-manage/twa-manifest.json';

const tenants = {
  bpnm: { manifest: bpnmManifest, release: bpnm },
  'document-manage': { manifest: documentManifest, release: documentManage },
};

type AndroidEnv = { ANDROID_TENANT?: string; ASSETS?: { fetch(request: Request): Promise<Response> } };
export const android = new Hono<{ Bindings: AndroidEnv }>();

function currentTenant(url: string, env?: AndroidEnv) {
  const id = env?.ANDROID_TENANT;
  if (id !== 'bpnm' && id !== 'document-manage') return;
  const tenant = tenants[id];
  return new URL(url).hostname === tenant.manifest.host ? tenant : undefined;
}

android.get('/.well-known/assetlinks.json', (c) => {
  const tenant = currentTenant(c.req.url, c.env);
  if (!tenant) return c.json([], 404);
  return c.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: tenant.manifest.packageId,
          sha256_cert_fingerprints: [tenant.release.certificate],
        },
      },
    ],
    200,
    { 'Cache-Control': 'public, max-age=300' }
  );
});

android.get('/downloads/android.json', (c) => {
  const tenant = currentTenant(c.req.url, c.env);
  if (!tenant) return c.json(null, 404);
  const { bytes, version } = tenant.release;
  return c.json({ bytes, version, href: '/downloads/android.apk' }, 200, { 'Cache-Control': 'no-store' });
});

android.get('/downloads/android.apk', async (c) => {
  const tenant = currentTenant(c.req.url, c.env);
  if (!tenant || !c.env?.ASSETS) return c.notFound();
  const response = await c.env.ASSETS.fetch(c.req.raw);
  if (!response.ok || response.headers.get('Content-Type')?.includes('text/html')) {
    return response.status === 304 ? response : c.notFound();
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/vnd.android.package-archive');
  headers.set('Content-Disposition', 'attachment; filename="' + tenant.release.file + '"');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'public, no-cache');
  return new Response(response.body, { status: response.status, headers });
});
