import * as LabelPrimitive from '@radix-ui/react-label';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cloneElement } from 'react';
import { cn } from '../../lib/utils';

const control =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-slate-100 aria-[invalid=true]:border-red-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(control, 'h-10', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-20', className)} {...props} />;
});

export function Label({ className, ...props }: LabelPrimitive.LabelProps) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium text-slate-800', className)}
      {...props}
    />
  );
}

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}

/** Wires label, hint and error text to the control for screen readers. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
