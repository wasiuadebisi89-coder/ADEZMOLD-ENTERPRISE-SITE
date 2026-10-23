import { zodResolver } from '@hookform/resolvers/zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { Alert } from '../../components/ui/feedback';
import { Field, Input } from '../../components/ui/form';
import { auth } from '../../lib/firebase';
import { AuthLayout } from './AuthLayout';
import { authErrorMessage } from './authErrors';

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/companies';
}

export default function SignIn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (e) {
      setError(authErrorMessage(e));
    }
  });

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New here?{' '}
          <Link
            className="font-medium text-brand-700 hover:underline"
            to={
              params.get('next')
                ? `/sign-up?next=${encodeURIComponent(params.get('next')!)}`
                : '/sign-up'
            }
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email" error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        <div className="flex items-center justify-between">
          <Link className="text-sm text-brand-700 hover:underline" to="/forgot-password">
            Forgot password?
          </Link>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Sign in
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
