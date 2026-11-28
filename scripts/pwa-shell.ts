import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function pwaShell(): Plugin {
  let publicDir: string;
  return {
    name: 'doc-hub-offline-shell',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_, bundle) {
      const files = [
        'manifest.webmanifest',
        'app-icon.svg',
        'icons/app-192.png',
        'icons/app-512.png',
        'icons/apple-touch-icon.png',
      ];
      const shell = Object.keys(bundle).filter(
        (name) => name === 'index.html' || /^assets\/.*\.(css|js)$/.test(name)
      );
      if (!shell.includes('index.html')) this.error('Missing app shell');
      const digest = createHash('sha256');
      for (const name of files) digest.update(readFileSync(path.join(publicDir, name)));
      for (const name of shell) {
        const file = bundle[name];
        digest.update(file.type === 'chunk' ? file.code : file.source);
      }
      // Workers Static Assets may redirect /index.html to the canonical root.
      const urls = [...shell, ...files].map((name) => (name === 'index.html' ? '/' : '/' + name));
      const source = `const cacheName = 'doc-hub-shell-${digest.digest('hex').slice(0, 16)}';
const files = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files.map(path => new Request(path, { credentials: 'omit', cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('doc-hub-shell-') && key !== cacheName).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const cached = path => caches.open(cacheName).then(cache => cache.match(path));
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => cached('/')));
  } else if (files.includes(url.pathname) && !url.search) {
    event.respondWith(cached(url.pathname).then(response => response || fetch(req)));
  }
});`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
