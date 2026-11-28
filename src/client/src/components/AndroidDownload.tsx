import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { guide as g } from '../i18n/guide.vi';

type Release = { version: string; bytes: number; href: string };

export function AndroidDownload() {
  const [release, setRelease] = useState<Release>();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/downloads/android.json', { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) {
          const data: Release = await response.json();
          if (!controller.signal.aborted && data.href === '/downloads/android.apk') setRelease(data);
        }
      })
      .catch(() => {
        /* The PWA remains available on hosts without an APK. */
      });
    return () => controller.abort();
  }, []);
  if (!release) return null;
  const size = (release.bytes / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  return (
    <div className="android-download">
      <a className="btn btn-ghost" href={release.href} download>
        <Download size={16} />
        {g.apkButton}
      </a>
      <small>
        {g.apkVersion} {release.version} · {size} MiB
      </small>
      <p>{g.apkHint}</p>
    </div>
  );
}
