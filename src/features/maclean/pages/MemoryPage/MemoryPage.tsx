import { useEffect, useState } from 'react';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { useMemory } from '@/features/maclean/api/useMemory';
import { appendMem, memSample, type MemSample } from '@/features/maclean/utils/memory';
import { MemoryComposition } from '@/features/maclean/components/MemoryComposition';
import { SwapCard } from '@/features/maclean/components/SwapCard';
import { TopAppsCard } from '@/features/maclean/components/TopAppsCard';
import { MemorySkeleton } from '@/features/maclean/components/MemorySkeleton';

export const MemoryPage = () => {
  const mem = useMemory();
  const [history, setHistory] = useState<MemSample[]>([]);
  const m = mem.data;

  useEffect(() => {
    if (m) setHistory((h) => appendMem(h, memSample(m)));
  }, [m]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-fg">Memory</h1>
        <p className="text-sm text-fg-muted">Live while this tab is open · read-only</p>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[90rem] space-y-4 p-6">
          {mem.isError && !m ? (
            <ErrorPanel
              error={mem.error}
              fallback="Couldn't read memory"
              onRetry={() => void mem.refetch()}
            />
          ) : !m ? (
            <MemorySkeleton />
          ) : (
            <>
              <MemoryComposition report={m} history={history} />
              <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                <SwapCard report={m} history={history} />
                <TopAppsCard report={m} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
