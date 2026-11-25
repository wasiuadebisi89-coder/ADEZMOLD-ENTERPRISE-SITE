import { describe, expect, it, vi } from 'vitest';
import { isStaleBuildError, reloadForNewBuild, RELOAD_WINDOW_MS } from './staleBuild';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('isStaleBuildError', () => {
  it('recognises chunk load failures from each browser', () => {
    expect(
      isStaleBuildError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://bmsclick.com.ng/assets/Journals-CyyZi2zO.js',
        ),
      ),
    ).toBe(true);
    expect(isStaleBuildError(new TypeError('error loading dynamically imported module'))).toBe(
      true,
    );
    expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isStaleBuildError(new Error('Missing or insufficient permissions.'))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });
});

describe('reloadForNewBuild', () => {
  it('reloads once, then not again within the window', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let now = 1_000_000;
    expect(reloadForNewBuild({ storage, reload, now: () => now })).toBe(true);
    now += 5_000;
    expect(reloadForNewBuild({ storage, reload, now: () => now })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again after the window has passed', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let now = 1_000_000;
    reloadForNewBuild({ storage, reload, now: () => now });
    now += RELOAD_WINDOW_MS + 1;
    expect(reloadForNewBuild({ storage, reload, now: () => now })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload without storage, since there would be no loop guard', () => {
    const reload = vi.fn();
    expect(reloadForNewBuild({ storage: null, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
