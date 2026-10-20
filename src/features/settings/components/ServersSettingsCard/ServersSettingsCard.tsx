import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import { setRemoteBackgroundMinutes, setRemotePollInterval } from '@/shared/state/settingsSlice';
import { Button } from '@/shared/ui/Button';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
// Deep imports: the remote barrel would chain RemotePage into Settings' chunk.
import { useRemoteState } from '@/features/remote/api/useRemoteState';
import { useSetConsent } from '@/features/remote/api/remoteMutations';
import { formatTime } from '@/shared/lib/format';
import { REMOTE_BACKGROUND_OPTIONS, REMOTE_POLL_OPTIONS } from './ServersSettingsCard.config';

export const ServersSettingsCard = () => {
  const dispatch = useAppDispatch();
  const pollMs = useAppSelector((s) => s.settings.remotePollIntervalMs);
  const bgMins = useAppSelector((s) => s.settings.remoteBackgroundMinutes);
  const state = useRemoteState();
  const consent = useSetConsent();
  const granted = state.data?.consent.granted ?? false;
  const since = state.data?.consent.grantedAtEpoch;

  return (
    <section className="rounded-xl border border-border bg-paper p-5">
      <h2 className="text-base font-semibold text-fg">Servers</h2>
      <div className="mt-2 divide-y divide-border">
        <div className="flex items-center justify-between gap-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-fg">Refresh</p>
            <p className="text-xs text-fg-muted">
              How often the open server is re-checked while the window is focused.
            </p>
          </div>
          <SegmentedControl
            ariaLabel="Server refresh interval"
            value={String(pollMs)}
            options={REMOTE_POLL_OPTIONS}
            onChange={(v) => dispatch(setRemotePollInterval(Number(v)))}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-fg">Check in the background</p>
            <p className="text-xs text-fg-muted">
              While Stackroost is in the menu bar, re-check servers that are already connected and
              notify only about new critical issues. Never connects on its own.
            </p>
          </div>
          <SegmentedControl
            ariaLabel="Background check interval"
            value={String(bgMins)}
            options={REMOTE_BACKGROUND_OPTIONS}
            onChange={(v) => dispatch(setRemoteBackgroundMinutes(Number(v)))}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-fg">SSH config access</p>
            <p className="text-xs text-fg-muted">
              {granted
                ? `Allowed${since ? ` since ${formatTime(since * 1000)}` : ''}. Revoking disconnects every server; your list stays.`
                : 'Not allowed. Stackroost reads nothing in ~/.ssh until you allow it on the Servers tab.'}
            </p>
          </div>
          {granted && (
            <Button
              variant="dangerOutline"
              size="sm"
              disabled={consent.isPending}
              onClick={() => consent.mutate(false)}
            >
              Revoke
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};
