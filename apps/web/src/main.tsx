import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// The browser hides blocked addresses in its own Content-Security-Policy messages; name them so
// a blocked request can be traced.
document.addEventListener('securitypolicyviolation', (e) => {
  console.warn(`Blocked by the content security policy (${e.violatedDirective}): ${e.blockedURI}`);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
