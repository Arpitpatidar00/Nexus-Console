import { FolderSearch } from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import type { StorageReport } from '@/features/maclean/api/maclean.schema';
import { useReveal } from '@/features/maclean/api/macleanMutations';
import { Card } from '@/features/maclean/components/Card';

const tilde = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');

/** Files of 1 GB or more. Reported only; Reveal opens Finder at the file. */
export const LargeFiles = ({ files }: { files: StorageReport['largeFiles'] }) => {
  const reveal = useReveal();
  return (
    <Card
      title="Large files"
      aside={
        <span className="text-xs text-fg-subtle">1 GB or more · Desktop, Documents, Downloads</span>
      }
    >
      <ul className="divide-y divide-border">
        {files.map((f) => (
          <li key={f.path} className="flex items-center gap-3 px-5 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={f.path}>
              {tilde(f.path)}
            </span>
            <span className="shrink-0 text-xs text-fg-muted tabular-nums">
              {formatBytes(f.bytes)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Reveal ${tilde(f.path)} in Finder`}
              onClick={() => reveal.mutate(f.path)}
            >
              <FolderSearch className="h-4 w-4" />
              Reveal
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
};
