import React from 'react';
import { cn } from '@/shared/lib/cn';
import { Mark } from './Mark';

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: number;
  markOnly?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, markOnly = false, className, ...props }) => {
  return (
    <span className={cn('sr-logo inline-flex items-center gap-2.5', className)} {...props}>
      <Mark size={size} label="Stackroost" />
      {!markOnly && (
        <span
          className="sr-logo__word font-display font-semibold tracking-tight text-fg select-none"
          aria-hidden="true"
          style={{ fontSize: Math.round(size * 0.72) + 'px' }}
        >
          stackroost
        </span>
      )}
    </span>
  );
};
