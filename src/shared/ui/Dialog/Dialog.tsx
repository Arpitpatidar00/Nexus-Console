import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { DialogProps } from './Dialog.types';

export const Dialog = ({ open, onOpenChange, title, description, children }: DialogProps) => (
  <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="nx-fade fixed inset-0 z-[var(--z-backdrop)] bg-black/40 backdrop-blur-sm" />
      <RadixDialog.Content className="nx-dialog fixed inset-x-0 top-[12vh] z-[var(--z-modal)] mx-auto flex max-h-[76vh] w-[min(30rem,92vw)] flex-col rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-float focus:outline-none">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
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
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  </RadixDialog.Root>
);
