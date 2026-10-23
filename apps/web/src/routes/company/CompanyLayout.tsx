import { Outlet, useParams } from 'react-router';
import { AppShell } from '../../components/AppShell';
import { Alert, Spinner } from '../../components/ui/feedback';
import { CompanyProvider, useCompany } from '../../lib/company';
import { Link } from 'react-router';

function Gate() {
  const { loading, member, company, error } = useCompany();
  if (loading) return <Spinner />;
  if (error || !member || member.status !== 'active' || !company) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Alert tone="error">
          You don't have access to this company.{' '}
          <Link to="/companies" className="font-medium underline">
            Back to your companies
          </Link>
        </Alert>
      </div>
    );
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function CompanyLayout() {
  const { companyId = '' } = useParams();
  return (
    <CompanyProvider companyId={companyId} key={companyId}>
      <Gate />
    </CompanyProvider>
  );
}
