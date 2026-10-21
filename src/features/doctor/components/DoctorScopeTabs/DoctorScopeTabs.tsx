import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import type { DoctorScopeTabsProps } from './DoctorScopeTabs.types';

export const DoctorScopeTabs = ({ tabs, activeTab, onSelectTab }: DoctorScopeTabsProps) => {
  const reduce = useReducedMotion();

  return (
    <nav className="relative flex border-b border-border px-6" aria-label="Report filter">
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={activeTab === value}
          onClick={() => onSelectTab(value)}
          className={cn(
            'relative h-10 px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-inset',
            activeTab === value ? 'text-ember-text' : 'text-fg-muted hover:bg-list hover:text-fg',
          )}
        >
          {label}
          {activeTab === value && (
            <motion.span
              aria-hidden
              layoutId="doctor-tab-underline"
              className="absolute inset-x-0 -bottom-px h-0.5 bg-ember"
              transition={
                reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }
              }
            />
          )}
        </button>
      ))}
    </nav>
  );
};
