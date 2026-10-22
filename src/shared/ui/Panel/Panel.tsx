import React from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  variant?: 'glass' | 'solid' | 'inverse';
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  actionDisabled?: boolean;
  onAction?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({
  variant = 'glass',
  title,
  subtitle,
  action,
  actionLabel,
  actionIcon,
  actionDisabled,
  onAction,
  className,
  children,
  ...props
}) => {
  const hasHead = title || subtitle || action || actionLabel;

  const resolvedAction =
    action ||
    (actionLabel ? (
      <Button
        variant={variant === 'inverse' ? 'ember' : 'glass'}
        size="sm"
        disabled={actionDisabled}
        onClick={onAction}
      >
        {actionIcon}
        {actionLabel}
      </Button>
    ) : null);

  const variantClass = {
    glass: 'sr-panel--glass glass text-card-foreground',
    solid: 'sr-panel--solid bg-popover text-popover-foreground border border-border',
    inverse: 'sr-panel--inverse bg-primary text-primary-foreground border-transparent',
  }[variant];

  return (
    <section
      className={cn(
        'sr-panel flex min-w-0 flex-col gap-4 rounded-xl p-6 transition-colors',
        variantClass,
        className,
      )}
      aria-label={typeof title === 'string' ? title : props['aria-label']}
      {...props}
    >
      {hasHead && (
        <header className="sr-panel__head flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && (
              <h3 className="sr-panel__title truncate font-display text-lg font-semibold tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                className={cn(
                  'sr-panel__sub text-[13px] leading-snug',
                  variant === 'inverse' ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
          {resolvedAction && <div className="shrink-0">{resolvedAction}</div>}
        </header>
      )}
      <div className="sr-panel__body flex min-h-0 min-w-0 flex-1 flex-col gap-3">{children}</div>
    </section>
  );
};
