import { useMutationState } from '@tanstack/react-query';
import { Spinner } from '@/shared/ui/Spinner';

export const ActivityBar = () => {
  const labels = useMutationState({
    filters: { status: 'pending', predicate: (m) => !m.meta?.quiet },
    select: (m) => {
      const verb = m.meta?.label ?? 'Working';
      const vars = m.state.variables;
      const name =
        vars && typeof vars === 'object' && 'name' in vars && typeof vars.name === 'string'
          ? vars.name
          : undefined;
      return name ? `${verb} ${name}` : verb;
    },
  });

  if (labels.length === 0) return null;

  const [first, ...rest] = labels;
  const text = rest.length > 0 ? `${first} +${rest.length} more` : first;

  return (
    <output className="absolute bottom-5 left-5 z-[var(--z-sticky)] flex max-w-[min(30rem,calc(100%-2.5rem))] animate-in items-center gap-3 rounded-full px-4 py-2.5 text-sm text-foreground shadow-float glass duration-200 fade-in slide-in-from-bottom-2">
      <Spinner className="size-4 text-ember" />
      <span className="truncate font-medium">{text}…</span>
      <span className="shrink-0 text-xs text-muted-foreground">Homebrew can take a minute.</span>
    </output>
  );
};
