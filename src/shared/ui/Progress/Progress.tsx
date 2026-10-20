import React from 'react';
import { cn } from '@/shared/lib/cn';

export interface ProgressProps {
  value: number;
  label?: string;
  valueText?: string;
  tone?: 'ember' | 'success' | 'warning' | 'danger' | 'ivory';
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  label,
  valueText,
  tone = 'ember',
  className,
}) => {
  const v = Math.max(0, Math.min(100, value || 0));

  const toneFill = {
    ember: 'bg-ember',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-destructive',
    ivory: 'bg-foreground',
  }[tone];

  return (
    <div className={cn('sr-progress flex min-w-0 flex-col gap-2', className)}>
      {label && (
        <div className="sr-progress__head flex justify-between gap-3 text-[13px] leading-[18px] font-medium text-muted-foreground">
          <span>{label}</span>
          <span className="font-mono">{valueText || `${Math.round(v)}%`}</span>
        </div>
      )}
      <div className="sr-progress__track relative h-2 overflow-hidden rounded-full border border-hairline bg-muted">
        <progress
          value={Math.round(v)}
          max={100}
          aria-label={label || 'Progress'}
          aria-valuetext={valueText}
          className="sr-only"
        />
        <span
          className={cn(
            'sr-progress__fill block h-full rounded-full transition-all duration-300',
            toneFill,
          )}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
};
