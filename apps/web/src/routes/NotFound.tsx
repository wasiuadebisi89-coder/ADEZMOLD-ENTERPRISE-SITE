import { Link } from 'react-router';
import { AuthLayout } from './auth/AuthLayout';

export default function NotFound() {
  return (
    <AuthLayout
      title="Page not found"
      subtitle="The page you're looking for doesn't exist or has moved."
    >
      <Link to="/" className="font-medium text-brand-700 hover:underline">
        Go to your companies
      </Link>
    </AuthLayout>
  );
}
