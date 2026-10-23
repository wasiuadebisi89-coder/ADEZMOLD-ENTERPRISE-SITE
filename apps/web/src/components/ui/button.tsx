import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const variants = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/60',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/60',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  asChild?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  asChild,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}
