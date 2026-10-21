import { ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Spinner } from '@/shared/ui/Spinner';
import { useConsentGranted, useSetConsent } from '../usePrivacy';
import type { ConsentGateProps } from './ConsentGate.types';

/** Renders `children` only once the user has allowed `source`. Rust enforces
 * the same consent, so this is the honest ask, not the protection. */
export const ConsentGate = ({ source, reason, children }: ConsentGateProps) => {
  const consent = useConsentGranted(source);
  const grant = useSetConsent();

  if (consent.isPending) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (consent.granted) return children;

  const name = consent.data?.find((r) => r.source === source)?.name ?? source;
  return (
    <EmptyState
      icon={<ShieldCheck className="size-10" />}
      title={`Allow access to ${name}?`}
      description={`${reason} Nothing is read until you allow it, and you can revoke it any time in Settings → Privacy.`}
      action={
        <Button
          variant="ember"
          disabled={grant.isPending}
          onClick={() => grant.mutate({ source, granted: true })}
        >
          Allow access
        </Button>
      }
    />
  );
};
