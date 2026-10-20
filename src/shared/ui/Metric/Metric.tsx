import React from 'react';
import { cn } from '@/shared/lib/cn';
import { Sparkline } from '@/shared/ui/Sparkline';

export interface MetricProps {
  value: React.ReactNode;
  unit?: string;
  label: string;
  tone?: 'ember' | 'success' | 'warning' | 'info' | 'danger' | 'neutral';
  progress?: number;
  spark?: number[];
  sparkTone?: 'ember' | 'ivory' | 'lime' | 'info';
  className?: string;
}

export const Metric: React.FC<MetricProps> = ({
  value,
  unit,
  label,
  tone,
  progress,
  spark,
  sparkTone = 'ember',
  className,
}) => {
  const dotColorClass = tone
    ? {
        ember: 'bg-ember',
        success: 'bg-success',
        warning: 'bg-warning',
        info: 'bg-info',
        danger: 'bg-destructive',
        neutral: 'bg-muted-foreground',
      }[tone]
    : null;

  return (
    <div className={cn('sr-metric flex min-w-0 flex-col gap-1.5', className)}>
      <div className="sr-metric__value flex items-baseline font-display text-[44px] leading-[48px] font-medium tracking-tight text-foreground tabular-nums">
        <span>{value}</span>
        {unit && (
          <span className="sr-metric__unit ml-1.5 text-xl font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </div>

      <div className="sr-metric__label flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
        {dotColorClass && (
          <span
            className={cn('sr-dot size-2 shrink-0 rounded-full', dotColorClass)}
            aria-hidden="true"
          />
        )}
        <span>{label}</span>
      </div>

      {progress != null && (
        <div
          className="sr-metric__bar mt-1 h-[3px] w-full max-w-[200px] overflow-hidden rounded-full bg-hairline"
          aria-hidden="true"
        >
          <span
            className="block h-full rounded-full bg-foreground transition-all duration-300"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}

      {spark && (
        <div className="mt-1">
          <Sparkline
            data={spark}
            tone={sparkTone}
            width={160}
            height={36}
            area
            label={`${label} trend`}
          />
        </div>
      )}
    </div>
  );
};
