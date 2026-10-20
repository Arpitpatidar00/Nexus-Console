import React from 'react';
import { cn } from '@/shared/lib/cn';

export interface MarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  label?: string;
  className?: string;
}

export const Mark: React.FC<MarkProps> = ({
  size = 32,
  label = 'Stackroost',
  className,
  ...props
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cn('sr-mark shrink-0', className)}
      aria-label={label}
      {...props}
    >
      <rect className="sr-mark__pill" x={16} y={80} width={88} height={18} rx={9} opacity={0.45} />
      <rect className="sr-mark__pill" x={28} y={57} width={64} height={18} rx={9} opacity={0.72} />
      <rect className="sr-mark__pill" x={40} y={34} width={40} height={18} rx={9} />
      {size >= 48 ? <circle className="sr-mark__ring" cx={60} cy={16} r={14} /> : null}
      <circle className="sr-mark__dot" cx={60} cy={16} r={size >= 48 ? 8 : 10} />
    </svg>
  );
};
