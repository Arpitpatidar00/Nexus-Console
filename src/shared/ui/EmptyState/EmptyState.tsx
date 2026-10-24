import { Mark } from '@/shared/ui/Logo';
import type { EmptyStateProps } from './EmptyState.types';

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 p-8 text-center select-none">
    {icon ? (
      <div className="text-muted-foreground">{icon}</div>
    ) : (
      <Mark size={56} className="opacity-80 transition-transform duration-300 hover:scale-105" />
    )}
    <div className="max-w-sm space-y-1.5">
      <p className="font-display text-lg font-semibold tracking-tight text-fg">{title}</p>
      {description && (
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
    {action && <div className="mt-2">{action}</div>}
  </div>
);
