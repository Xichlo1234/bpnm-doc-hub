// Run from a trusted workstation with gh authenticated to this repository.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tenant = process.argv[2];
if (!['bpnm', 'document-manage'].includes(tenant)) throw new Error('Chọn bpnm hoặc document-manage.');
const dir = process.env.APK_KEY_DIR || path.join(homedir(), '.android-keys', 'doc-hub');
const password = readFileSync(path.join(dir, tenant + '.password'), 'utf8').trimEnd();
const secrets = {
  ANDROID_KEYSTORE_BASE64: readFileSync(path.join(dir, tenant + '.p12')).toString('base64'),
  ANDROID_KEYSTORE_PASSWORD: password,
  ANDROID_KEY_ALIAS: 'release',
  ANDROID_KEY_PASSWORD: password, // PKCS12 uses the same password for the store and key.
};
for (const [prefix, value] of Object.entries(secrets)) {
  const name = prefix + '_' + tenant.toUpperCase().replaceAll('-', '_');
  const result = spawnSync('gh', ['secret', 'set', name, '--repo', 'Xichlo1234/bpnm-doc-hub'], {
    input: value,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (result.error || result.status !== 0) throw new Error('Không lưu được ' + name);
  console.log(name);
}
