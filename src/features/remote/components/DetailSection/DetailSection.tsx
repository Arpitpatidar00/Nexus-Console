import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface DetailSectionProps {
  title: string;
  /** One plain-language line under the title: what this section answers. */
  description?: ReactNode;
  /** Right-aligned controls or a count. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** One block of a host's detail view. Sections stack flat with a hairline
 * between them, and share the header's px-6 so every column lines up. */
export const DetailSection = ({
  title,
  description,
  aside,
  className,
  children,
}: DetailSectionProps) => (
  <section className={cn('border-b border-hairline px-6 py-5 last:border-b-0', className)}>
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
    </div>
    {children}
  </section>
);
