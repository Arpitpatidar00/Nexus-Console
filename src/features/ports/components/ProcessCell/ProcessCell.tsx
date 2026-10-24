import { Badge } from '@/shared/ui/Badge';

export const ProcessCell = ({
  command,
  user,
  detached,
  project,
}: {
  command: string;
  user: string;
  detached?: boolean;
  project?: string | null;
}) => (
  <div className="flex min-w-0 flex-col">
    <div className="flex items-center gap-2">
      <span className="truncate text-sm font-medium text-fg">{command}</span>
      {detached && (
        <Badge
          tone="warning"
          size="sm"
          title="Lost its controlling terminal; still holding this port"
        >
          Detached
        </Badge>
      )}
    </div>
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{user}</span>
      {project && (
        <>
          <span>·</span>
          <span className="truncate font-mono text-[11px] text-fg/80">{project}</span>
        </>
      )}
    </div>
  </div>
);
