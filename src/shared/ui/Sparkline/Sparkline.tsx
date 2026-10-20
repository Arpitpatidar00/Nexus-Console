import React from 'react';
import { cn } from '@/shared/lib/cn';

export interface SparklineProps {
  data?: number[];
  values?: (number | null)[];
  width?: number;
  height?: number;
  tone?: 'ember' | 'ivory' | 'lime' | 'info' | 'success' | 'warning' | 'danger';
  area?: boolean;
  marker?: boolean;
  label?: string;
  className?: string;
}

function sparkPath(data: number[], w: number, ht: number, pad: number) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => [pad + i * step, pad + (1 - (v - min) / range) * (ht - pad * 2)]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const mx = ((a[0] + b[0]) / 2).toFixed(1);
    d += ` C${mx} ${a[1].toFixed(1)} ${mx} ${b[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  return { d, pts };
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  values,
  width = 120,
  height = 36,
  tone = 'ember',
  area = true,
  marker = false,
  label = 'Trend',
  className,
}) => {
  // Normalize input data
  const rawData: number[] =
    data && data.length
      ? data
      : values && values.length
        ? values.filter((v): v is number => v !== null)
        : [];

  if (rawData.length < 2) {
    return null;
  }

  const pad = 3;
  const s = sparkPath(rawData, width, height, pad);
  const last = s.pts[s.pts.length - 1];
  const areaPath = `${s.d} L${last[0].toFixed(1)} ${height} L${s.pts[0][0].toFixed(1)} ${height} Z`;

  const toneClass = {
    ember: 'sr-spark--ember text-ember stroke-ember',
    ivory: 'sr-spark--ivory text-foreground stroke-foreground',
    lime: 'sr-spark--lime text-success stroke-success',
    info: 'sr-spark--info text-info stroke-info',
    success: 'sr-spark--lime text-success stroke-success',
    warning: 'sr-spark--ember text-warning stroke-warning',
    danger: 'sr-spark--ember text-destructive stroke-destructive',
  }[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('sr-spark shrink-0 overflow-visible', toneClass, className)}
      aria-label={label}
    >
      {area && <path className="sr-spark__area fill-current opacity-15" d={areaPath} />}
      <path
        className="sr-spark__line fill-none stroke-current"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={s.d}
      />
      {marker && <circle className="sr-spark__dot fill-current" cx={last[0]} cy={last[1]} r={3} />}
    </svg>
  );
};
