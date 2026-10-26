import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import type { SegmentedControlProps } from './SegmentedControl.types';

export const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  equalWidth = false,
}: SegmentedControlProps<T>) => {
  const reduce = useReducedMotion();
  const groupId = useId();

  return (
    <fieldset
      aria-label={ariaLabel}
      className={cn(
        'm-0 inline-flex shrink-0 items-center gap-0.5 rounded-full border border-hairline bg-muted p-1 select-none',
        className,
      )}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex h-8 cursor-pointer items-center justify-center rounded-full px-3.5 text-center text-[13px] font-medium transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              equalWidth ? 'min-w-[3.25rem] flex-1' : 'shrink-0',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={groupId}
                className="absolute inset-0 rounded-full bg-primary shadow-sm"
                transition={
                  reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }
                }
              />
            )}
            <span className="relative z-10 truncate px-0.5">{o.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
};
