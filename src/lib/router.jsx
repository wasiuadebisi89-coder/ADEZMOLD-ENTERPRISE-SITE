// Minimal History-API router. The site has a handful of flat routes, so this
// avoids a routing dependency while keeping clean, shareable URLs
// (needed for LinkedIn landing pages and UTM links).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);

function readLocation() {
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash };
}

export function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function Router({ children }) {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLocation(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.href);
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href);
      return;
    }
    const next = url.pathname + url.search + url.hash;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', next);
    setLocation(readLocation());
    if (url.hash) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useLocation() {
  return useContext(RouterContext).location;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function useSearchParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function Link({ to, onClick, children, ...rest }) {
  const navigate = useNavigate();
  const handleClick = (event) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target
    ) {
      return;
    }
    event.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

/** Renders the component registered for the current path, or `fallback`. */
export function Routes({ routes, fallback: Fallback }) {
  const { pathname } = useLocation();
  const Page = routes[normalizePath(pathname)] ?? Fallback;
  return <Page />;
}
