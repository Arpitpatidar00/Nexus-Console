import type { ReactNode } from 'react';
import { PackageX } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useDetectedTools } from '../useDetectedTools';

interface RequiresToolProps {
  /** Any of these tool ids being installed is enough. */
  anyOf: string[];
  /** One line on how to get it, e.g. `brew install awscli`. */
  install: string;
  children: ReactNode;
}

/** The one "tool not installed" state (PLAN F.5): renders children only when
 * a required CLI exists, instead of letting each command fail with a toast. */
export const RequiresTool = ({ anyOf, install, children }: RequiresToolProps) => {
  const tools = useDetectedTools();
  // Unknown (still detecting, or detection failed) → don't block the page.
  if (!tools.data) return children;
  const wanted = tools.data.filter((t) => anyOf.includes(t.id));
  if (wanted.some((t) => t.installed)) return children;

  const names = wanted.map((t) => t.label).join(' or ') || anyOf.join(' or ');
  return (
    <EmptyState
      icon={<PackageX className="size-10" />}
      title={`${names} isn't installed`}
      description={`This page needs ${names} on this Mac. Install it, then come back — the page checks again on its own.`}
      action={
        <code className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-fg">{install}</code>
      }
    />
  );
};
