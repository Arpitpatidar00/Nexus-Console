import type { ReactNode } from 'react';
import type { ConsentSource } from '../privacy.schema';

export interface ConsentGateProps {
  source: ConsentSource;
  /** What the module reads and why, in one or two plain sentences. */
  reason: string;
  children: ReactNode;
}
