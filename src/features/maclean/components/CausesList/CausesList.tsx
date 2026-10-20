import { formatBytes } from '@/shared/lib/format';
import type { StorageReport } from '@/features/maclean/api/maclean.schema';
import { Card } from '@/features/maclean/components/Card';

/** Root causes, biggest first, each with the fix the user applies themselves. */
export const CausesList = ({ causes }: { causes: StorageReport['causes'] }) => (
  <Card title="Root causes">
    <ol className="divide-y divide-border">
      {causes.map((c, i) => (
        <li key={c.text} className="flex gap-3 px-5 py-3 text-sm">
          <span className="w-5 shrink-0 font-semibold text-fg-subtle tabular-nums">{i + 1}.</span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-fg">
              {c.bytes != null && (
                <span className="mr-1.5 font-semibold text-warn tabular-nums">
                  {formatBytes(c.bytes)}
                </span>
              )}
              {c.text}
            </p>
            <p className="text-fg-muted">{c.fix}</p>
          </div>
        </li>
      ))}
    </ol>
  </Card>
);
