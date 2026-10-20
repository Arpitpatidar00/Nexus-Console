import { cn } from '@/shared/lib/cn';
import { Logo } from '@/shared/ui/Logo';

interface SplashScreenProps {
  /** true → fade out over the app content (crossfade exit). */
  leaving?: boolean;
}

/** Branded launch splash — themed ground + Stackroost mark, shown while Bootstrap gates
 * first paint, then crossfaded out over the app. */
export const SplashScreen = ({ leaving = false }: SplashScreenProps) => (
  <div
    aria-hidden
    className={cn(
      'fixed inset-0 z-[var(--z-toast)] flex items-center justify-center ground',
      'transition-opacity duration-300 ease-out select-none',
      leaving ? 'pointer-events-none opacity-0' : 'opacity-100',
    )}
  >
    <div className="flex animate-in flex-col items-center gap-4 duration-200 zoom-in-95 fade-in">
      <Logo size={64} />
      <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground/70 uppercase">
        Smoked Glass
      </span>
    </div>
  </div>
);
