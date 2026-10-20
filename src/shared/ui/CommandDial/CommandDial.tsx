import React from 'react';
import { cn } from '@/shared/lib/cn';
import type { LucideIcon } from 'lucide-react';
import {
  Server,
  Activity,
  Plug,
  Terminal,
  Shield,
  HardDrive,
  Cpu,
  MessageSquare,
  Settings,
  Layers,
} from 'lucide-react';

export interface DialItem {
  id: string;
  label: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string; size?: number }>;
}

export interface CommandDialProps {
  items: DialItem[];
  active?: string;
  onSelect?: (id: string) => void;
  onKnob?: () => void;
  label?: string;
  className?: string;
  showList?: boolean;
}

const DEFAULT_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  services: Activity,
  servers: Server,
  remote: Server,
  ports: Plug,
  terminal: Terminal,
  doctor: Shield,
  storage: HardDrive,
  memory: Cpu,
  claude: MessageSquare,
  settings: Settings,
};

function sector(c: number, R: number, r: number, a0: number, a1: number) {
  const pt = (rad: number, a: number) =>
    `${(c + rad * Math.cos(a)).toFixed(2)} ${(c + rad * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(R, a0)} A${R} ${R} 0 ${large} 1 ${pt(R, a1)} L${pt(r, a1)} A${r} ${r} 0 ${large} 0 ${pt(r, a0)} Z`;
}

export const CommandDial: React.FC<CommandDialProps> = ({
  items,
  active,
  onSelect,
  onKnob,
  label = 'Modules',
  className,
  showList = true,
}) => {
  const currentActive = active || (items[0] ? items[0].id : '');
  const size = 340;
  const c = size / 2;
  const R = 166;
  const r = 106;
  const n = Math.max(items.length, 1);
  const span = (Math.PI * 2) / n;
  const gap = 0.035;
  const start = -Math.PI / 2 - span / 2;
  const activeIdx = Math.max(
    0,
    items.findIndex((i) => i.id === currentActive),
  );

  const handleKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(id);
    }
  };

  return (
    <div className={cn('sr-dial flex items-center gap-8 select-none', className)}>
      <div className="sr-dial__wheel relative size-[340px] shrink-0">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="group"
          aria-label={label}
          className="block"
        >
          <circle className="sr-dial__groove" cx={c} cy={c} r={r - 4} />
          {items.map((it, i) => {
            const a0 = start + i * span + gap;
            const a1 = start + (i + 1) * span - gap;
            const mid = (a0 + a1) / 2;
            const ix = c + ((R + r) / 2) * Math.cos(mid) - 10;
            const iy = c + ((R + r) / 2) * Math.sin(mid) - 10;
            const isOn = it.id === currentActive;
            const IconComp = it.icon || DEFAULT_ICON_MAP[it.id] || Layers;

            return (
              <g key={it.id}>
                <path
                  d={sector(c, R, r, a0, a1)}
                  className={cn(
                    'sr-dial__seg transition-colors duration-150',
                    isOn && 'is-on fill-ember-soft stroke-ember',
                  )}
                  tabIndex={0}
                  role="button"
                  aria-label={it.label}
                  aria-pressed={isOn}
                  onClick={() => onSelect?.(it.id)}
                  onKeyDown={(e) => handleKey(e, it.id)}
                />
                <foreignObject
                  x={ix}
                  y={iy}
                  width={20}
                  height={20}
                  className="pointer-events-none overflow-visible"
                >
                  <div
                    className={cn(
                      'flex size-5 items-center justify-center transition-colors',
                      isOn ? 'text-ember-text' : 'text-muted-foreground',
                    )}
                  >
                    <IconComp size={18} />
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        <button
          type="button"
          className="sr-dial__knob cursor-pointer transition-transform duration-200 active:scale-95"
          aria-label="Open command palette"
          onClick={onKnob}
        >
          <Layers className="size-7 text-[#1A181B]" />
        </button>
      </div>

      {showList && (
        <div className="sr-dial__list flex flex-col gap-2.5">
          {items.map((it, i) => {
            const isOn = it.id === currentActive;
            const tilt = (i - activeIdx) * 6;
            const IconComp = it.icon || DEFAULT_ICON_MAP[it.id] || Layers;
            return (
              <button
                key={it.id}
                type="button"
                aria-pressed={isOn}
                className={cn('sr-dial__chip cursor-pointer select-none', isOn && 'is-on')}
                style={{
                  transform: `rotate(${tilt}deg) translateX(${-Math.abs(i - activeIdx) * 8}px)`,
                }}
                onClick={() => onSelect?.(it.id)}
              >
                <IconComp size={18} />
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
