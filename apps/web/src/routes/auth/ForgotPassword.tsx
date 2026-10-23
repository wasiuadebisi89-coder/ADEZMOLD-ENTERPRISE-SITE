import { zodResolver } from '@hookform/resolvers/zod';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { Alert } from '../../components/ui/feedback';
import { Field, Input } from '../../components/ui/form';
import { auth } from '../../lib/firebase';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ email: z.email('Enter a valid email') });

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch {
      // Same response whether or not the account exists.
    }
    setSent(true);
  });

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a link to choose a new password."
      footer={
        <Link className="font-medium text-brand-700 hover:underline" to="/sign-in">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">
          If an account exists for that email, a reset link is on its way.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
