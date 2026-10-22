import { Router, Routes } from './lib/router.jsx';
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

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes routes={routes} fallback={NotFound} />
      </Layout>
    </Router>
  );
}
