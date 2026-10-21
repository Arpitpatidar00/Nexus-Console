import { ChevronRight, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { useAppDispatch } from '@/shared/state/hooks';
import { setActiveTab } from '@/shared/state/uiSlice';
import { useModuleEnabled } from '@/shared/modules';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Spinner } from '@/shared/ui/Spinner';
import { cn } from '@/shared/lib/cn';
import { useHomeIssues } from '../../api/useHomeIssues';

/** One screen of real issues across modules (PLAN F.2). */
export const HomePage = () => {
  const dispatch = useAppDispatch();
  const { issues, isLoading, checkedServers } = useHomeIssues();
  const remoteOn = useModuleEnabled('remote');

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-fg">Home</h1>
          <p className="text-sm text-fg-muted">
            Problems Stackroost measured across your enabled modules. Each one opens the page that
            fixes it.
          </p>
        </div>
        {isLoading && <Spinner />}
      </header>

      {issues.length === 0 && !isLoading ? (
        <EmptyState
          icon={<CircleCheck className="size-10 text-success" />}
          title="All quiet"
          description="No failed services, low disk, memory pressure, down monitors or stray ports right now."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((issue) => {
            const Icon = issue.severity === 'red' ? CircleAlert : TriangleAlert;
            return (
              <li key={issue.id}>
                <button
                  type="button"
                  onClick={() => dispatch(setActiveTab(issue.tab))}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-paper p-3 text-left transition-colors hover:bg-list focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      issue.severity === 'red'
                        ? 'bg-danger-soft text-destructive'
                        : 'bg-warning-soft text-warning',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {issue.title}
                    </span>
                    <span className="block truncate text-xs text-fg-muted">{issue.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {remoteOn && (
        <p className="mt-4 text-xs text-fg-subtle">
          {checkedServers > 0
            ? `Server issues come from the last check of ${checkedServers} server${checkedServers === 1 ? '' : 's'}; Home never connects on its own.`
            : 'Open a server on the Servers page to include its issues here — Home never connects on its own.'}
        </p>
      )}
    </div>
  );
};
