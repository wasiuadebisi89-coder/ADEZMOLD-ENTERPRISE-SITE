import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initInstallPrompt,
  installMode,
  isIos,
  promptInstall,
  resetInstallStateForTests,
} from './installApp';

function fakePrompt(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn(() => Promise.resolve());
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

describe('isIos', () => {
  it('spots iPhones and iPads, including iPadOS posing as a Mac', () => {
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', maxTouchPoints: 5 }),
    ).toBe(true);
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }),
    ).toBe(true);
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }),
    ).toBe(false);
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/131', maxTouchPoints: 5 }),
    ).toBe(false);
  });
});

describe('install prompt', () => {
  initInstallPrompt();
  afterEach(() => resetInstallStateForTests());

  it('falls back to manual steps until the browser offers an install', () => {
    expect(installMode()).toBe('manual');
  });

  it('uses the browser dialog once offered, and hides after install', async () => {
    const e = fakePrompt('accepted');
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(installMode()).toBe('prompt');
    await expect(promptInstall()).resolves.toBe(true);
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(installMode()).toBe('installed');
  });

  it('goes back to manual steps if the user dismisses the dialog', async () => {
    window.dispatchEvent(fakePrompt('dismissed'));
    await expect(promptInstall()).resolves.toBe(false);
    expect(installMode()).toBe('manual');
  });

  it('hides once the app is installed from the browser menu', () => {
    window.dispatchEvent(new Event('appinstalled'));
    expect(installMode()).toBe('installed');
  });
});
