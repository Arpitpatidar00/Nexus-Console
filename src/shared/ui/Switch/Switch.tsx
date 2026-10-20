import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import type { SwitchProps } from './Switch.types';

export const Switch = ({ checked, onChange, ariaLabel, disabled, id }: SwitchProps) => {
  const reduce = useReducedMotion();
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[26px] w-11 shrink-0 cursor-pointer items-center rounded-full border border-input transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        checked ? 'border-transparent bg-ember shadow-sm' : 'bg-muted',
      )}
    >
      <motion.span
        className={cn(
          'inline-block size-5 rounded-full shadow-sm',
          checked ? 'bg-ember-foreground' : 'bg-foreground',
        )}
        animate={{ x: checked ? 20 : 2 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
      />
    </button>
  );
};
