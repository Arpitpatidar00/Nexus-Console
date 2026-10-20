import type { ReactNode } from 'react';

export interface CardProps {
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}
