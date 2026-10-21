import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/shared/lib/cn';

export interface TooltipProps {
  label: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({
  label,
  side = 'right',
  align = 'center',
  sideOffset = 12,
  className,
  children,
}) => {
  if (!label) return <>{children}</>;

  const trigger = React.isValidElement(children) ? (
    children
  ) : (
    <span className="inline-flex">{children}</span>
  );

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'z-[var(--z-tooltip,1500)] animate-in rounded-lg border border-hairline bg-popover/95 px-3 py-1.5 text-xs font-medium tracking-wide text-popover-foreground shadow-float backdrop-blur-md duration-150 fade-in-0 select-none zoom-in-95 data-[state=closed]:zoom-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            className,
          )}
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-popover/95" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
