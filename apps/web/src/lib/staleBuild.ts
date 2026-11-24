/**
 * Recovery for a stale build. Each deploy replaces the hashed files under /assets, so a tab that
 * loaded the previous build asks for page files (for example Journals-<old hash>.js) that no
 * longer exist. The browser then reports "Failed to fetch dynamically imported module". Reloading
 * picks up the new index.html and its new file names.
 *
 * The reload happens at most once per RELOAD_WINDOW_MS, so a genuinely broken file cannot cause
 * a reload loop; after that the error screen asks the person to reload.
 */

const KEY = 'bms:stale-build-reload-at';
export const RELOAD_WINDOW_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite CSS preload
  /'text\/html' is not a valid JavaScript MIME type/i,
];

export function isStaleBuildError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

interface Deps {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  reload?: () => void;
  now?: () => number;
}

function sessionStore(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reloads the page unless it already reloaded for this reason within the last RELOAD_WINDOW_MS.
 * Returns true when a reload was started.
 */
export function reloadForNewBuild(deps: Deps = {}): boolean {
  const storage = deps.storage === undefined ? sessionStore() : deps.storage;
  const now = (deps.now ?? Date.now)();
  const reload = deps.reload ?? (() => window.location.reload());
  try {
    const last = Number(storage?.getItem(KEY) ?? 0);
    if (last && now - last < RELOAD_WINDOW_MS) return false;
    storage?.setItem(KEY, String(now));
  } catch {
    // Without storage there is no loop guard, so do not reload automatically.
    return false;
  }
  if (!storage) return false;
  reload();
  return true;
}

/** Vite fires 'vite:preloadError' when a lazily loaded page file cannot be fetched. */
export function installStaleBuildRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
