import { Code, Cog, Globe, HardDrive, Power, Stethoscope } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';

/** What one scan covers — shown instead of blank tabs on first run. */
const AREAS = [
  {
    icon: Cog,
    label: 'System',
    desc: 'Low Power Mode, memory pressure, Time Machine',
    badge: 'bg-ember-soft text-ember-text',
  },
  {
    icon: Code,
    label: 'VSCode',
    desc: 'Extensions, orphan caches, database bloat',
    badge: 'bg-success-soft text-success',
  },
  {
    icon: Globe,
    label: 'Browser',
    desc: 'Memory, extension cost, caches',
    badge: 'bg-info-soft text-info',
  },
  {
    icon: HardDrive,
    label: 'Disk',
    desc: 'Free space, dev caches, ollama models',
    badge: 'bg-warning-soft text-warning',
  },
  {
    icon: Power,
    label: 'Startup',
    desc: 'Third-party launch agents',
    badge: 'bg-success-soft text-success',
  },
];

/** First-run hero: teaches what the Doctor checks and offers the two scans. */
export const ScanHero = ({
  onScan,
  onDeepScan,
}: {
  onScan: () => void;
  onDeepScan: () => void;
}) => (
  <div className="h-full overflow-y-auto">
    <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-6 p-8 select-none">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-ember-soft text-ember">
          <Stethoscope className="size-8" />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-fg">
          Check your Mac&apos;s health
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          One read-only scan across key areas. Nothing changes without your confirmation.
        </p>
      </div>

      <div className="flex w-full items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-xs font-medium text-muted-foreground">Scan areas</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map(({ icon: Icon, label, desc, badge }) => (
          <div
            key={label}
            className="flex h-22 items-center gap-3 rounded-xl p-4 shadow-edge glass transition-all hover:bg-glass-strong"
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                badge,
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{label}</span>
              <span className="line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                {desc}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ember" onClick={onScan}>
            <Stethoscope className="size-4" />
            Scan
          </Button>
          <Button variant="glass" onClick={onDeepScan}>
            <HardDrive className="size-4" />
            Deep scan
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Read-only: checks what is installed and running, changes nothing.
        </p>
      </div>
    </div>
  </div>
);
