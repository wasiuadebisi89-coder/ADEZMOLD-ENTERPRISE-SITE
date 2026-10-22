import { Router, Routes } from './lib/router.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import { makeInProgressPage, NotFound } from './pages/InProgress.jsx';

// Pages marked "in progress" are replaced in Stage 3 (Services, Checklist,
// About, Consultation) and Stage 7 (Privacy).
const routes = {
  '/': Home,
  '/services': makeInProgressPage({
    title: 'Our Services',
    intro: 'Full details of the Produce Business Health Check, Business Systems Implementation and Ongoing Business Advisory are being prepared.',
  }),
  '/checklist': makeInProgressPage({
    title: 'Free Produce Business Health Checklist',
    intro: 'The free checklist download is being set up.',
  }),
  '/about': makeInProgressPage({
    title: 'About Adezmold',
    intro: 'Our firm profile and founder story are being prepared.',
  }),
  '/consultation': makeInProgressPage({
    title: 'Book a Consultation',
    intro: 'The online consultation request form is being set up.',
  }),
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
