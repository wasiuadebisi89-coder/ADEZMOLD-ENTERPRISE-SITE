import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Spinner } from './components/ui/feedback';
import { AuthProvider, useAuth } from './lib/auth';
import { PublicOnly, RequireAuth } from './routes/guards';

const SignIn = lazy(() => import('./routes/auth/SignIn'));
const SignUp = lazy(() => import('./routes/auth/SignUp'));
const ForgotPassword = lazy(() => import('./routes/auth/ForgotPassword'));
const VerifyEmail = lazy(() => import('./routes/auth/VerifyEmail'));
const Companies = lazy(() => import('./routes/Companies'));
const CreateCompany = lazy(() => import('./routes/CreateCompany'));
const AcceptInvite = lazy(() => import('./routes/AcceptInvite'));
const CompanyLayout = lazy(() => import('./routes/company/CompanyLayout'));
const Dashboard = lazy(() => import('./routes/company/Dashboard'));
const Members = lazy(() => import('./routes/company/Members'));
const Roles = lazy(() => import('./routes/company/Roles'));
const Branches = lazy(() => import('./routes/company/Branches'));
const Periods = lazy(() => import('./routes/company/Periods'));
const Settings = lazy(() => import('./routes/company/Settings'));
const AuditLog = lazy(() => import('./routes/company/AuditLog'));
const Accounts = lazy(() => import('./routes/company/Accounts'));
const Journals = lazy(() => import('./routes/company/Journals'));
const NewJournal = lazy(() => import('./routes/company/NewJournal'));
const JournalDetail = lazy(() => import('./routes/company/JournalDetail'));
const OpeningBalances = lazy(() => import('./routes/company/OpeningBalances'));
const TrialBalance = lazy(() => import('./routes/company/TrialBalance'));
const Approvals = lazy(() => import('./routes/company/Approvals'));
const NotFound = lazy(() => import('./routes/NotFound'));

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? '/companies' : '/sign-in'} replace />;
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  {
    path: '/sign-in',
    element: (
      <PublicOnly>
        <SignIn />
      </PublicOnly>
    ),
  },
  {
    path: '/sign-up',
    element: (
      <PublicOnly>
        <SignUp />
      </PublicOnly>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <PublicOnly>
        <ForgotPassword />
      </PublicOnly>
    ),
  },
  {
    path: '/verify-email',
    element: (
      <RequireAuth verified={false}>
        <VerifyEmail />
      </RequireAuth>
    ),
  },
  {
    path: '/companies',
    element: (
      <RequireAuth>
        <Companies />
      </RequireAuth>
    ),
  },
  {
    path: '/companies/new',
    element: (
      <RequireAuth>
        <CreateCompany />
      </RequireAuth>
    ),
  },
  {
    path: '/invite/:invitationId',
    element: (
      <RequireAuth>
        <AcceptInvite />
      </RequireAuth>
    ),
  },
  {
    path: '/c/:companyId',
    element: (
      <RequireAuth>
        <CompanyLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'members', element: <Members /> },
      { path: 'roles', element: <Roles /> },
      { path: 'branches', element: <Branches /> },
      { path: 'periods', element: <Periods /> },
      { path: 'settings', element: <Settings /> },
      { path: 'audit', element: <AuditLog /> },
      { path: 'accounts', element: <Accounts /> },
      { path: 'journals', element: <Journals /> },
      { path: 'journals/new', element: <NewJournal /> },
      { path: 'journals/:journalId', element: <JournalDetail /> },
      { path: 'opening-balances', element: <OpeningBalances /> },
      { path: 'trial-balance', element: <TrialBalance /> },
      { path: 'approvals', element: <Approvals /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Spinner />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  );
}
