import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/Panel';
import { Switch } from '@/shared/ui/Switch';
import { formatTime } from '@/shared/lib/format';
import {
  useConsents,
  useNetDestinations,
  useRevokeAllConsents,
  useSetConsent,
} from '@/shared/privacy';

/** Settings → Privacy: every local data source Stackroost can read (A-06) and
 * every network destination it can reach (A-07), both read from Rust. */
export const PrivacyCard = () => {
  const consents = useConsents();
  const destinations = useNetDestinations();
  const setConsent = useSetConsent();
  const revokeAll = useRevokeAllConsents();
  const anyGranted = consents.data?.some((c) => c.granted) ?? false;

  return (
    <Panel
      title="Privacy"
      subtitle="What Stackroost may read on this Mac, and every place it can connect to. No telemetry, no accounts."
      className="xl:col-span-2"
      action={
        <Button
          variant="dangerOutline"
          size="sm"
          disabled={!anyGranted || revokeAll.isPending}
          onClick={() => revokeAll.mutate()}
        >
          Revoke all
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="sr-caption mb-1">Local data access</p>
          <div className="divide-y divide-hairline">
            {consents.data?.map((c) => (
              <div key={c.source} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-fg">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.granted
                      ? `Allowed${c.grantedAtEpoch ? ` since ${formatTime(c.grantedAtEpoch * 1000)}` : ''}`
                      : 'Not allowed — nothing is read'}
                  </p>
                </div>
                <Switch
                  ariaLabel={`Allow ${c.name}`}
                  checked={c.granted}
                  disabled={setConsent.isPending}
                  onChange={(granted) => setConsent.mutate({ source: c.source, granted })}
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="sr-caption mb-1">Network destinations</p>
          <div className="divide-y divide-hairline">
            {destinations.data?.map((d) => (
              <div key={d.id} className="py-3">
                <p className="text-sm font-medium text-fg">
                  <span className={d.userConfigured ? '' : 'font-mono'}>{d.hostPattern}</span>
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{d.module}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.purpose}
                  {!d.outbound && ' · stays on this Mac'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
};
