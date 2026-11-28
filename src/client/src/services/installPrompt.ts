interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pending: InstallPrompt | undefined;
let installed = false;
const events = new EventTarget();
const changed = () => events.dispatchEvent(new Event('change'));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pending = event as InstallPrompt;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pending = undefined;
    changed();
  });
}

export const subscribeInstall = (listener: () => void) => {
  events.addEventListener('change', listener);
  return () => events.removeEventListener('change', listener);
};
export const installState = () => (installed ? 'installed' : pending ? 'ready' : 'manual');
export async function requestInstall() {
  const event = pending;
  if (!event) return;
  pending = undefined;
  changed();
  await event.prompt();
  await event.userChoice;
}
