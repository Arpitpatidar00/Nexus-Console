import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';

export interface Shortcut {
  label: string;
  /** What it would select, shown on the chip; 0 disables it. */
  bytes?: number;
  /** One line on hover: what it keeps and what it picks. */
  hint?: string;
  /** The selection already equals this shortcut's. */
  active?: boolean;
  onClick: () => void;
}

/** One-click selections above a list: each chip says how much it would pick. */
export const ShortcutBar = ({
  label = 'Select',
  shortcuts,
  onClear,
  className,
}: {
  label?: string;
  shortcuts: Shortcut[];
  onClear?: () => void;
  className?: string;
}) => (
  <div className={cn('flex flex-wrap items-center gap-1.5 text-xs', className)}>
    <span className="mr-0.5 text-fg-subtle">{label}</span>
    {shortcuts.map((s) => {
      const empty = s.bytes === 0;
      return (
        <button
          key={s.label}
          type="button"
          title={s.hint}
          disabled={empty}
          aria-pressed={s.active}
          onClick={s.onClick}
          className={cn(
            'cursor-pointer rounded-full border px-2.5 py-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-45',
            s.active
              ? 'border-ember bg-ember-soft text-ember-text'
              : 'border-hairline text-fg hover:bg-list',
          )}
        >
          {s.label}
          {s.bytes != null && s.bytes > 0 && (
            <span className="ml-1 text-fg-subtle tabular-nums">· {formatBytes(s.bytes)}</span>
          )}
        </button>
      );
    })}
    {onClear && (
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer px-1.5 py-1 text-fg-subtle hover:text-fg"
      >
        None
      </button>
    )}
  </div>
);
