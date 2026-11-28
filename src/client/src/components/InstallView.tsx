import { useState, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Compass, Share, SquarePlus, Smartphone, Download } from 'lucide-react';
import { guide as g } from '../i18n/guide.vi';
import { installState, requestInstall, subscribeInstall } from '../services/installPrompt';

export function InstallView({ publicPage = false }: { publicPage?: boolean }) {
  const state = useSyncExternalStore(subscribeInstall, installState);
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const mobile = ios || /Android/i.test(ua);
  const installed =
    state === 'installed' ||
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  const url = new URL('/install', location.origin).href;
  const [manual, setManual] = useState(false);
  const icons = [Compass, Share, SquarePlus];
  return (
    <main className="guide-scroll install-scroll" lang="vi">
      <article className="guide-page install-page">
        <header className="guide-heading">
          <img className="install-icon" src="/icons/app-192.png" alt="" width="64" height="64" />
          <h1>{g.install}</h1>
          <p>{g.installBrief}</p>
        </header>
        {installed ? (
          <section className="guide-card">
            <h2>{g.installed}</h2>
          </section>
        ) : (
          <>
            {!mobile && (
              <section className="guide-card qr-card">
                <QRCodeSVG value={url} size={144} level="M" marginSize={4} title={g.scan} />
                <div>
                  <h2>{g.scan}</h2>
                  <p>{g.scanNote}</p>
                  <a href={url}>{url}</a>
                </div>
              </section>
            )}
            {(ios || !mobile) && (
              <section className="guide-card">
                <div className="guide-kicker">
                  <Smartphone size={16} />
                  iOS
                </div>
                <h2>{g.iphone}</h2>
                {ios && !safari && <p className="guide-warning">{g.safari}</p>}
                <ol className="ios-steps">
                  {g.iosSteps.map((step, i) => {
                    const Icon = icons[i];
                    return (
                      <li key={step}>
                        <div className="ios-picture">
                          <Icon size={26} />
                          <small>{g.iosLabels[i]}</small>
                        </div>
                        <span>{step}</span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
            {!ios && (
              <section className="guide-card">
                <div className="guide-kicker">
                  <Smartphone size={16} />
                  Android
                </div>
                <h2>{g.android}</h2>
                {state === 'ready' && !manual ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => requestInstall().catch(() => setManual(true))}
                  >
                    <Download size={16} />
                    {g.installButton}
                  </button>
                ) : (
                  <p>{g.androidHint}</p>
                )}
              </section>
            )}
          </>
        )}
        {publicPage && (
          <a href="/" className="btn btn-ghost">
            {g.open}
          </a>
        )}
      </article>
    </main>
  );
}
