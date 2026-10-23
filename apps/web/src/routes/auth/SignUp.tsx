import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
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

const schema = z
  .object({
    displayName: z.string().trim().min(2, 'Enter your name').max(120),
    email: z.email('Enter a valid email'),
    password: z.string().min(10, 'Use at least 10 characters').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

export default function SignUp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '', confirm: '' },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit(async ({ displayName, email, password }) => {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      await sendEmailVerification(cred.user);
      const next = params.get('next');
      navigate(`/verify-email${next ? `?next=${encodeURIComponent(next)}` : ''}`, {
        replace: true,
      });
    } catch (e) {
      setError(authErrorMessage(e));
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You'll set up your company next."
      footer={
        <>
          Already have an account?{' '}
          <Link className="font-medium text-brand-700 hover:underline" to="/sign-in">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Your name" error={errors.displayName?.message}>
          <Input autoComplete="name" {...form.register('displayName')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 10 characters.">
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
