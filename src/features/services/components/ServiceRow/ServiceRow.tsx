import { StatusChip } from '@/shared/ui/StatusChip';
import { ServiceStatsInline } from '@/features/services/components/ServiceStatsInline';
import { LinkChip } from '@/features/services/components/LinkChip';
import { ServiceActions } from '@/features/services/components/ServiceActions';
import { ServiceMenu } from '@/features/services/components/ServiceMenu';
import { StartFailureNotice } from '@/features/services/components/StartFailureNotice';
import { iconFor } from '@/features/services/components/ServiceCard';
import type { ReconciledService } from '@/shared/brew';

export const ServiceRow = ({ service }: { service: ReconciledService }) => {
  const Icon = iconFor(service.formula);
  const isRunning = service.status === 'running' || service.status === 'starting';

  return (
    <div className="sr-row flex min-h-14 items-center gap-3 rounded-lg px-3.5 py-2.5 shadow-edge glass transition-colors hover:bg-glass-strong">
      <div className="sr-row__icon flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-fg">
        <Icon className="size-4" />
      </div>

      <div className="min-w-[6rem] flex-1">
        <p className="sr-row__title truncate text-sm font-medium text-fg">{service.displayName}</p>
        <p className="sr-row__sub truncate font-mono text-xs text-muted-foreground">
          {service.formula}
          {service.port ? ` · :${service.port}` : ''}
        </p>
      </div>

      <StatusChip status={service.status} />
      {service.status !== 'notInstalled' && <LinkChip linkState={service.linkState} />}
      <StartFailureNotice service={service} />

      {isRunning && (
        <div className="hidden shrink-0 font-mono text-xs text-muted-foreground xl:block">
          <ServiceStatsInline
            cpu={service.cpu}
            memoryBytes={service.memoryBytes}
            uptimeSecs={service.uptimeSecs}
          />
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2">
        <ServiceActions service={service} compact />
        <ServiceMenu service={service} />
      </div>
    </div>
  );
};
