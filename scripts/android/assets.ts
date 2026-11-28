import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

// Prepare both deployment directories from the same web build. Each binding contains one APK.
export function androidAssets(): Plugin {
  let output: string;
  return {
    name: 'tenant-android-downloads',
    apply: 'build',
    configResolved(config) {
      output = path.resolve(config.root, config.build.outDir);
    },
    async writeBundle() {
      const second = path.join(path.dirname(output), 'client-document-manage');
      // Like Vite's emptyOutDir, discard obsolete hashed assets from the previous build.
      if (output !== path.resolve('dist/client')) throw new Error('Thư mục đầu ra Vite phải là dist/client.');
      await rm(second, { recursive: true, force: true });
      await cp(output, second, { recursive: true });
      for (const [tenant, directory] of [
        ['bpnm', output],
        ['document-manage', second],
      ]) {
        const source = path.resolve('android', tenant);
        const info = JSON.parse(await readFile(path.join(source, 'release.json'), 'utf8'));
        const apk = await readFile(path.join(source, tenant + '.apk'));
        if (info.bytes !== apk.length || info.sha256 !== createHash('sha256').update(apk).digest('hex')) {
          throw new Error('APK không khớp hồ sơ phát hành: ' + tenant);
        }
        await mkdir(path.join(directory, 'downloads'), { recursive: true });
        await writeFile(path.join(directory, 'downloads', 'android.apk'), apk);
      }
    },
  };
}
