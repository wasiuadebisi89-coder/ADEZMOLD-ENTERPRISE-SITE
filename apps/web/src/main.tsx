import './pwa';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installStaleBuildRecovery } from './lib/staleBuild';
import './styles.css';

// The browser hides blocked addresses in its own Content-Security-Policy messages; name them so
// a blocked request can be traced.
document.addEventListener('securitypolicyviolation', (e) => {
  console.warn(`Blocked by the content security policy (${e.violatedDirective}): ${e.blockedURI}`);
});

// After a deploy, an open tab's lazily loaded pages point at files that no longer exist: reload
// once to pick up the new build.
installStaleBuildRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
