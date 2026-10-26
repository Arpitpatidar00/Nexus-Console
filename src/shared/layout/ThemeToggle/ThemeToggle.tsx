import React, { useRef, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import { useThemeTransition } from './useThemeTransition';
import { LiquidThemeWave } from './LiquidThemeWave';

interface ThemeToggleProps {
  className?: string;
}

/** Header quick toggle between light/dark with full-screen liquid transition animation. */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const { toggleTheme, activeWave, isDark } = useThemeTransition();
  const [isPressing, setIsPressing] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    toggleTheme(e);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={handleClick}
        onMouseDown={() => setIsPressing(true)}
        onMouseUp={() => setIsPressing(false)}
        onMouseLeave={() => setIsPressing(false)}
        className={cn(
          'relative flex size-9 items-center justify-center rounded-full',
          'border border-border/60 bg-secondary/80 text-fg',
          'shadow-sm backdrop-blur-md transition-colors duration-200',
          'hover:bg-accent hover:text-accent-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'cursor-pointer overflow-hidden active:scale-95',
          className,
        )}
      >
        {/* Subtle liquid sheen gradient */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/15 to-transparent opacity-60"
          aria-hidden="true"
        />

        {/* Morphing icon container with liquid spring easing */}
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.span
              key="sun"
              initial={{ scale: 0.3, rotate: -70, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.3, rotate: 70, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              className="flex items-center justify-center text-ember"
            >
              <Sun className="size-4.5 stroke-[2.2]" />
            </motion.span>
          ) : (
            <motion.span
              key="moon"
              initial={{ scale: 0.3, rotate: 70, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.3, rotate: -70, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 22 }}
              className="flex items-center justify-center text-fg"
            >
              <Moon className="size-4.5 stroke-[2.2]" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Micro-ripple ping feedback when clicked */}
        {isPressing && (
          <span
            className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-primary/20 opacity-75"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Full-screen liquid wave ripple overlay */}
      <LiquidThemeWave wave={activeWave} />
    </>
  );
};
