import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted text-foreground border-hairline',
        neutral: 'bg-muted text-foreground border-hairline',
        success: 'bg-success-soft text-success border-transparent',
        warning: 'bg-warning-soft text-warning border-transparent',
        info: 'bg-info-soft text-info border-transparent',
        destructive: 'bg-danger-soft text-destructive border-transparent',
        danger: 'bg-danger-soft text-destructive border-transparent',
        ember: 'bg-ember-soft text-ember-text border-transparent',
        prod: 'bg-danger-soft text-destructive border-destructive font-mono tracking-[.08em]',
      },
      size: {
        default: 'h-6 px-2.5 text-xs',
        sm: 'h-5 px-2 text-[11px]',
        lg: 'h-7 px-3 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
  tone?: VariantProps<typeof badgeVariants>['variant'];
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant,
  tone,
  size,
  dot,
  children,
  ...props
}) => {
  const resolvedVariant = variant || tone || 'default';
  return (
    <span className={cn(badgeVariants({ variant: resolvedVariant, size }), className)} {...props}>
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
};
