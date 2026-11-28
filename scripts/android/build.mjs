import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tenant = process.argv[2];
if (!['bpnm', 'document-manage'].includes(tenant))
  throw new Error('Dùng npm run apk:build -- bpnm hoặc document-manage.');
const tools = path.dirname(fileURLToPath(import.meta.url));
const release = path.resolve(tools, '../../android', tenant);
const manifestFile = path.join(release, 'twa-manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const work = mkdtempSync(path.join(tmpdir(), 'doc-hub-twa-'));
const sdk = process.env.ANDROID_HOME;
const jdk = process.env.JAVA_HOME;
if (!jdk || !sdk) throw new Error('Cần đặt JAVA_HOME và ANDROID_HOME.');
const java = path.join(jdk, 'bin', 'java');
const config = path.join(work, 'bubblewrap-config.json');
const cli = path.join(tools, 'node_modules/@bubblewrap/cli/bin/bubblewrap.js');
if (!existsSync(cli)) throw new Error('Chạy npm ci --prefix scripts/android trước khi đóng gói.');
const keyDir = process.env.APK_KEY_DIR || path.join(homedir(), '.android-keys', 'doc-hub');
const key = path.join(keyDir, manifest.signingKey.path);
const password = path.join(keyDir, tenant + '.password');
if (!existsSync(key) || !existsSync(password))
  throw new Error('Thiếu khóa ký hoặc tệp mật khẩu của ' + tenant);
writeFileSync(config, JSON.stringify({ jdkPath: jdk, androidSdkPath: sdk }));
function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: work,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || command + ' thất bại');
  return result.stdout;
}
console.log('Thư mục dự án Android tạm:', work);
run(process.execPath, [
  cli,
  'update',
  '--skipVersionUpgrade',
  '--config',
  config,
  '--directory',
  work,
  '--manifest',
  manifestFile,
  '--fetchEngine',
  'node-fetch',
]);
// The pinned template still declares JCenter. Use Maven Central for maintained dependencies.
const gradle = path.join(work, 'build.gradle');
writeFileSync(gradle, readFileSync(gradle, 'utf8').replaceAll('jcenter()', 'mavenCentral()'));
run(java, [
  '-classpath',
  'gradle/wrapper/gradle-wrapper.jar',
  'org.gradle.wrapper.GradleWrapperMain',
  ':app:assembleRelease',
  '--console=plain',
]);
const signer = path.join(sdk, 'build-tools', '36.0.0', 'lib', 'apksigner.jar');
const signed = path.join(work, 'signed.apk');
run(java, [
  '-jar',
  signer,
  'sign',
  '--ks',
  key,
  '--ks-key-alias',
  manifest.signingKey.alias,
  '--ks-pass',
  'file:' + password,
  '--out',
  signed,
  'app/build/outputs/apk/release/app-release-unsigned.apk',
]);
const verification = run(java, ['-jar', signer, 'verify', '--verbose', '--print-certs', signed], true);
console.log(verification);
const cert = verification
  .match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1]
  .match(/../g)
  ?.join(':')
  .toUpperCase();
if (!cert || cert !== manifest.fingerprints[0]?.value)
  throw new Error('Chứng thư APK khác fingerprint trong manifest.');
const aapt = path.join(sdk, 'build-tools', '36.0.0', 'aapt');
const badging = run(aapt, ['dump', 'badging', signed], true);
const identity = /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m.exec(badging);
if (
  !identity ||
  identity[1] !== manifest.packageId ||
  Number(identity[2]) !== manifest.appVersionCode ||
  identity[3] !== manifest.appVersion
) {
  throw new Error('Package hoặc phiên bản trong APK khác twa-manifest.json.');
}
const bytes = readFileSync(signed);
const file = tenant + '.apk';
copyFileSync(signed, path.join(release, file));
writeFileSync(
  path.join(release, 'release.json'),
  JSON.stringify(
    {
      file,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      version: manifest.appVersion,
      versionCode: manifest.appVersionCode,
      packageName: manifest.packageId,
      certificate: cert,
    },
    null,
    2
  ) + '\n'
);
console.log(path.join(release, file), bytes.length, 'bytes');
