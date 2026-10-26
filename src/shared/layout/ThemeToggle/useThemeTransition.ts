import { useCallback, useRef, useState } from 'react';
import { useAppDispatch } from '@/shared/state/hooks';
import { setTheme, type ThemeMode } from '@/shared/state/settingsSlice';
import { useResolvedTheme } from '@/shared/state/useResolvedTheme';
import type { LiquidWaveData } from './LiquidThemeWave';

type TriggerOrigin =
  React.MouseEvent<HTMLElement> | HTMLElement | { x: number; y: number } | undefined;

interface UseThemeTransitionReturn {
  toggleTheme: (trigger?: TriggerOrigin, explicitTarget?: 'light' | 'dark') => void;
  activeWave: LiquidWaveData | null;
  isDark: boolean;
}

export const useThemeTransition = (): UseThemeTransitionReturn => {
  const dispatch = useAppDispatch();
  const currentResolved = useResolvedTheme();
  const isDark = currentResolved === 'dark';
  const [activeWave, setActiveWave] = useState<LiquidWaveData | null>(null);
  const waveIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleTheme = useCallback(
    (trigger?: TriggerOrigin, explicitTarget?: 'light' | 'dark') => {
      const nextTheme: 'light' | 'dark' = explicitTarget ?? (isDark ? 'light' : 'dark');

      // Determine the liquid transition origin (defaults to top-right if unspecified)
      let x = typeof window !== 'undefined' ? window.innerWidth - 44 : 0;
      let y = 36;

      if (trigger) {
        if ('clientX' in trigger && typeof trigger.clientX === 'number') {
          // MouseEvent
          const targetEl = trigger.currentTarget as HTMLElement | null;
          if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
            const rect = targetEl.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top + rect.height / 2;
          } else {
            x = trigger.clientX;
            y = trigger.clientY;
          }
        } else if (
          'getBoundingClientRect' in trigger &&
          typeof trigger.getBoundingClientRect === 'function'
        ) {
          // HTMLElement
          const rect = trigger.getBoundingClientRect();
          x = rect.left + rect.width / 2;
          y = rect.top + rect.height / 2;
        } else if ('x' in trigger && 'y' in trigger) {
          // Explicit coordinates
          x = trigger.x;
          y = trigger.y;
        }
      }

      // Calculate maximum distance to the furthest corner (typically bottom-left)
      const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const maxRadius = Math.ceil(
        Math.hypot(Math.max(x, viewportW - x), Math.max(y, viewportH - y)),
      );

      // Check reduced-motion preference
      const isReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Update CSS variables for CSS keyframe fallback
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--theme-toggle-x', `${x}px`);
        document.documentElement.style.setProperty('--theme-toggle-y', `${y}px`);
        document.documentElement.style.setProperty('--theme-toggle-radius', `${maxRadius}px`);
      }

      // Trigger the liquid ripple overlay animation unless reduced-motion is requested
      if (!isReducedMotion) {
        waveIdRef.current += 1;
        setActiveWave({
          id: waveIdRef.current,
          x,
          y,
          maxRadius,
          isDark: nextTheme === 'dark',
        });

        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          setActiveWave(null);
        }, 760);
      }

      // Execute view transition or fallback
      const doc =
        typeof document !== 'undefined'
          ? (document as unknown as {
              startViewTransition?: (cb: () => void) => { ready: Promise<void> };
            })
          : null;

      if (doc && typeof doc.startViewTransition === 'function' && !isReducedMotion) {
        const transition = doc.startViewTransition(() => {
          // Synchronously apply data-theme so snapshot immediately captures new tokens
          document.documentElement.dataset.theme = nextTheme;
          try {
            localStorage.setItem('stackroost-theme', nextTheme);
          } catch {
            /* ignore */
          }
          dispatch(setTheme(nextTheme as ThemeMode));
        });

        transition.ready
          .then(() => {
            try {
              document.documentElement.animate(
                {
                  clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${maxRadius}px at ${x}px ${y}px)`,
                  ],
                },
                {
                  duration: 700,
                  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                  pseudoElement: '::view-transition-new(root)',
                },
              );
            } catch {
              // The CSS animation liquid-theme-expand defined in index.css runs automatically
            }
          })
          .catch(() => {
            // Transition aborted or not supported
          });
      } else {
        if (typeof document !== 'undefined') {
          document.documentElement.dataset.theme = nextTheme;
          try {
            localStorage.setItem('stackroost-theme', nextTheme);
          } catch {
            /* ignore */
          }
        }
        dispatch(setTheme(nextTheme as ThemeMode));
      }
    },
    [dispatch, isDark],
  );

  return {
    toggleTheme,
    activeWave,
    isDark,
  };
};
