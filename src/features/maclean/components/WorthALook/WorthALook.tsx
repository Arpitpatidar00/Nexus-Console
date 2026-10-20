import type { StorageReport } from '@/features/maclean/api/maclean.schema';
import { Card } from '@/features/maclean/components/Card';

/** Reported only: nothing here is ever deleted automatically. */
export const WorthALook = ({ insights }: { insights: StorageReport['insights'] }) => (
  <Card title="Worth a look" aside={<span className="text-xs text-fg-subtle">Reported only</span>}>
    {insights.length === 0 ? (
      <p className="px-5 py-3 text-sm text-fg-muted">Nothing notable. Nice and tidy.</p>
    ) : (
      <ul className="divide-y divide-border">
        {insights.map((n) => (
          <li key={n.id} className="space-y-1 px-5 py-3 text-sm">
            <p className="text-fg">{n.text}</p>
            {n.detail.length > 0 && (
              <ul className="space-y-0.5 text-xs text-fg-muted">
                {n.detail.map((d) => (
                  <li key={d} className="truncate font-mono" title={d}>
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    )}
  </Card>
);
