import { cn } from '@/shared/lib/cn';
import type { CardProps } from './Card.types';

/** One report section: a titled card. Sections sit side by side, never nested. */
export const Card = ({ title, aside, className, children }: CardProps) => (
  <section
    className={cn(
      'flex min-w-0 flex-col rounded-xl text-card-foreground shadow-edge glass',
      className,
    )}
  >
    <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
      <h2 className="font-display text-sm font-semibold text-fg">{title}</h2>
      {aside}
    </header>
    {children}
  </section>
);
