import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { DialogProps, DialogSize } from './Dialog.types';

const WIDTH: Record<DialogSize, string> = {
  sm: 'w-[min(30rem,92vw)]',
  md: 'w-[min(36rem,92vw)]',
  lg: 'w-[min(44rem,92vw)]',
  xl: 'w-[min(60rem,94vw)]',
};

export const Dialog = ({
  open,
  onOpenChange,
  title,
  description,
  size = 'sm',
  footer,
  children,
}: DialogProps) => (
  <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="nx-fade fixed inset-0 z-[var(--z-backdrop)] bg-black/40 backdrop-blur-sm" />
      <RadixDialog.Content
        // No description → opt out explicitly, or Radix logs an a11y warning.
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'nx-dialog fixed inset-x-0 top-[10vh] z-[var(--z-modal)] mx-auto flex max-h-[80vh] flex-col rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-float focus:outline-none',
          WIDTH[size],
        )}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <RadixDialog.Title className="font-display text-lg font-semibold tracking-tight text-foreground">
              {title}
            </RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="text-[13px] leading-snug text-muted-foreground">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            aria-label="Close"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </RadixDialog.Close>
        </div>
        <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">{children}</div>
        {footer && (
          <div className="mt-5 flex shrink-0 items-center justify-end gap-2 border-t border-border pt-4">
            {footer}
          </div>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>
);
