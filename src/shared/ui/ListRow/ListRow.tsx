import React from 'react';
import { cn } from '@/shared/lib/cn';

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  trailing?: React.ReactNode;
  active?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children?: React.ReactNode;
}

export const ListRow: React.FC<ListRowProps> = ({
  icon,
  title,
  subtitle,
  meta,
  status,
  trailing,
  active,
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (!e.defaultPrevented && onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
    }
  };

  const inner = (
    <>
      {icon && (
        <span
          className="sr-row__icon flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <div className="sr-row__text flex min-w-0 flex-1 flex-col justify-center">
        <div className="sr-row__title truncate font-sans text-sm leading-snug font-medium text-foreground">
          {title}
        </div>
        {subtitle && (
          <div className="sr-row__sub truncate font-mono text-xs text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {meta && (
        <div className="sr-row__meta hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">
          {meta}
        </div>
      )}
      {status}
      {children}
      {trailing}
    </>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'sr-row flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3.5 py-2 glass transition-colors select-none hover:bg-glass-strong focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]',
          active && 'sr-row--on border-ember bg-glass-strong',
          className,
        )}
        {...props}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'sr-row flex min-h-14 min-w-0 items-center gap-3 rounded-lg px-3.5 py-2 glass transition-colors select-none',
        active && 'sr-row--on border-ember bg-glass-strong',
        className,
      )}
      {...props}
    >
      {inner}
    </div>
  );
};
