import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** One report section: a titled card. Sections sit side by side, never nested. */
export const Card = ({
  title,
  aside,
  className,
  children,
}: {
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) => (
  <section
    className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-paper', className)}
  >
    <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {aside}
    </header>
    {children}
  </section>
);
