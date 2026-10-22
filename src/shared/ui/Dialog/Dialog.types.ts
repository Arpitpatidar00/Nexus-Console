import type { ReactNode } from 'react';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Width step — `sm` (30rem, default) for confirms/forms, up to `xl` for browsers/editors. */
  size?: DialogSize;
  /** Pinned below the scrolling body — the action row. */
  footer?: ReactNode;
  children: ReactNode;
}
