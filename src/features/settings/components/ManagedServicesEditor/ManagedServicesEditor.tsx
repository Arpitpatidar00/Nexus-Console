import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { removeManaged } from '@/shared/state/serviceIntentSlice';
import { Button } from '@/shared/ui/Button';
import { ConnectServiceModal } from '@/features/services/components/ConnectServiceModal';
import { iconFor } from '@/features/services/components/ServiceCard';

export const ManagedServicesEditor = () => {
  const managed = useAppSelector((s) => s.serviceIntent.managed);
  const dispatch = useAppDispatch();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <section className="rounded-xl p-6 text-card-foreground shadow-edge glass">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-fg">Managed services</h2>
          <p className="text-xs text-muted-foreground">
            Services Stackroost keeps in view, even when they&apos;re stopped.
          </p>
        </div>
        <Button variant="ember" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add service
        </Button>
      </div>

      {managed.length === 0 ? (
        <p className="mt-4 rounded-lg px-4 py-8 text-center text-sm text-muted-foreground glass">
          No managed services yet. Add one to pin it here.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
          {managed.map((m) => {
            const Icon = iconFor(m.formula);
            return (
              <li
                key={m.formula}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 glass transition-colors hover:bg-glass-strong"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-fg">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{m.displayName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{m.formula}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${m.displayName}`}
                  onClick={() => dispatch(removeManaged(m.formula))}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConnectServiceModal open={addOpen} onOpenChange={setAddOpen} />
    </section>
  );
};
