import React, { useState } from 'react';
import { cn } from '@/shared/lib/cn';

export interface TooltipProps {
  label: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ label, side = 'right', className, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const sideStyle: React.CSSProperties =
    side === 'right'
      ? { top: '50%', left: 'calc(100% + 10px)', transform: 'translateY(-50%)' }
      : side === 'left'
        ? { top: '50%', right: 'calc(100% + 10px)', transform: 'translateY(-50%)' }
        : side === 'bottom'
          ? { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }
          : { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' };

  return (
    <span
      className="sr-tip-wrap relative inline-flex"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {children}
      {isOpen && (
        <span
          role="tooltip"
          style={sideStyle}
          className={cn(
            'sr-tip is-open pointer-events-none absolute z-50 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-primary-foreground shadow-md transition-opacity duration-150',
            className,
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
};
