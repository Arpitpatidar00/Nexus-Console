import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { cn } from '@/shared/lib/cn';
import type { KafkaCluster } from '../../api/kafka.schema';

interface ClusterSidebarProps {
  clusters: KafkaCluster[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (c: KafkaCluster) => void;
  onRemove: (c: KafkaCluster) => void;
}

const SECURITY_LABEL: Record<KafkaCluster['security'], string> = {
  plaintext: 'plaintext',
  ssl: 'TLS',
  saslPlaintext: 'SASL',
  saslSsl: 'SASL + TLS',
};

export const ClusterSidebar = ({
  clusters,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onRemove,
}: ClusterSidebarProps) => (
  <aside
    aria-label="Kafka clusters"
    className="flex w-64 shrink-0 flex-col border-r border-hairline bg-canvas"
  >
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-hairline px-3">
      <span className="text-[13px] font-semibold text-fg">Clusters</span>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label="Add cluster"
        title="Add cluster"
        onClick={onAdd}
      >
        <Plus />
      </Button>
    </div>
    <nav className="min-h-0 flex-1 overflow-y-auto p-2">
      {clusters.map((c) => {
        const active = c.id === selectedId;
        return (
          <div
            key={c.id}
            className={cn(
              'group flex items-center gap-1 rounded-md transition-colors',
              active ? 'bg-ember-soft' : 'hover:bg-accent',
            )}
          >
            <button
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(c.id)}
              className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex w-full min-w-0 items-center gap-1.5">
                <span
                  className={cn(
                    'truncate text-[13px] font-medium',
                    active ? 'text-ember-text' : 'text-fg',
                  )}
                >
                  {c.name}
                </span>
                {c.env === 'prod' && (
                  <Badge tone="prod" size="sm">
                    PROD
                  </Badge>
                )}
              </span>
              <span className="w-full truncate font-mono text-[11px] text-muted-foreground">
                {c.bootstrap[0]}
                {c.bootstrap.length > 1 ? ` +${c.bootstrap.length - 1}` : ''} ·{' '}
                {SECURITY_LABEL[c.security]}
              </span>
            </button>
            <div className="flex shrink-0 gap-0.5 pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={`Edit ${c.name}`}
                title="Edit"
                onClick={() => onEdit(c)}
              >
                <Pencil />
              </Button>
              <Button
                variant="dangerGhost"
                size="iconSm"
                aria-label={`Remove ${c.name}`}
                title="Remove"
                onClick={() => onRemove(c)}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        );
      })}
    </nav>
  </aside>
);
