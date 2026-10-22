import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/** `md` (44px) for dialogs/forms, `sm` (36px) for toolbars — inputs and selects
 *  of the same size line up exactly, which ad-hoc `py-*` paddings never did. */
type ControlSize = 'sm' | 'md';

const CONTROL =
  'w-full min-w-0 rounded-md border border-input bg-muted font-sans text-foreground transition-colors placeholder:text-muted-foreground focus:border-ring focus:shadow-ring-ember focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

const SIZE: Record<ControlSize, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-11 px-4 text-sm',
};

interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export const Field = ({ label, hint, error, htmlFor, className, children }: FieldProps) => (
  <div className={cn('sr-field', className)}>
    <label htmlFor={htmlFor}>{label}</label>
    {children}
    {error ? (
      <span className="sr-field__hint text-destructive">{error}</span>
    ) : (
      hint && <span className="sr-field__hint">{hint}</span>
    )}
  </div>
);

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize;
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'md', mono, className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(CONTROL, SIZE[size], mono && 'font-mono', className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: ControlSize;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'md', className, children, ...props }, ref) => (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        className={cn(CONTROL, 'cursor-pointer appearance-none', SIZE[size], 'pr-9')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ mono, className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        CONTROL,
        'min-h-20 resize-y px-3 py-2.5 text-sm',
        mono && 'font-mono text-[13px]',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
