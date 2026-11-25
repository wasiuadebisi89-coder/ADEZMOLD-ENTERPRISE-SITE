// Imported first in main.tsx, so the install offer is caught and the service worker registered
// even if a later module fails to load.
import { initInstallPrompt, registerServiceWorker } from './lib/installApp';

initInstallPrompt();
if (import.meta.env.PROD) registerServiceWorker();
