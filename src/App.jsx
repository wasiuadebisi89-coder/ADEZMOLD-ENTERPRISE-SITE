import { lazy, Suspense } from 'react';
import { normalizePath, Router, Routes, useLocation } from './lib/router.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import About from './pages/About.jsx';
import Checklist from './pages/Checklist.jsx';
import Consultation from './pages/Consultation.jsx';
import { makeInProgressPage, NotFound } from './pages/InProgress.jsx';

// The privacy notice is written in Stage 7 (see README).
const routes = {
  '/': Home,
  '/services': Services,
  '/checklist': Checklist,
  '/about': About,
  '/consultation': Consultation,
  '/privacy': makeInProgressPage({
    title: 'Privacy & Data Protection',
    intro: 'Our privacy notice is being prepared.',
  }),
};

// Staff lead register: separate bundle, no public header/footer.
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

function Shell() {
  const { pathname } = useLocation();
  if (normalizePath(pathname) === '/admin') {
    return (
      <Suspense fallback={<p className="p-6 text-on-surface-variant">Loading…</p>}>
        <AdminApp />
      </Suspense>
    );
  }
  return (
    <Layout>
      <Routes routes={routes} fallback={NotFound} />
    </Layout>
  );
}

export default function App() {
  return (
    <Router>
      <Shell />
    </Router>
  );
}
