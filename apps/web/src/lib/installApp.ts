import { useSyncExternalStore } from 'react';

/**
 * Installing BMS as an app on a phone or computer.
 *
 * Chrome, Edge and Samsung Internet fire `beforeinstallprompt` when the site can be installed;
 * we keep that event so an "Install app" button can show the browser's own install dialog. On
 * Android that installs a real app (icon in the app drawer, its own window, listed in Settings >
 * Apps). iPhone and iPad Safari have no such event, so there the button shows the
 * Share > Add to Home Screen steps instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** How the install button should behave on this device. */
export type InstallMode =
  /** Already running as the installed app: hide the button. */
  | 'installed'
  /** The browser offered an install dialog we can open. */
  | 'prompt'
  /** iPhone or iPad: show the Add to Home Screen steps. */
  | 'ios'
  /** Any other browser: show general steps (open in Chrome, then Install app). */
  | 'manual';

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function isStandalone(win: Window = window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; a touch screen gives it away.
  return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
}

export function installMode(): InstallMode {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'manual';
}

/** Starts listening for the browser's install events. Call once, as early as possible. */
export function initInstallPrompt(win: Window = window): void {
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  win.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

/** Opens the browser's install dialog. Resolves true if the user installed the app. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // The event can only be used once.
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') installed = true;
  notify();
  return outcome === 'accepted';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, installMode, () => 'manual');
}

/** Registers the service worker that makes BMS installable and shows a page when offline. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
      console.warn('Service worker registration failed', err);
    });
  });
}

/** For tests: forget any captured event. */
export function resetInstallStateForTests(): void {
  deferred = null;
  installed = false;
  notify();
}
