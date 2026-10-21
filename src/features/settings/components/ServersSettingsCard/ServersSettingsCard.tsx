import { useAppDispatch, useAppSelector } from '@/shared/state/hooks';
import {
  setRemoteBackgroundMinutes,
  setRemotePollInterval,
  setRemoteDeadmanMinutes,
} from '@/shared/state/settingsSlice';
import { Button } from '@/shared/ui/Button';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { useRemoteState } from '@/features/remote/api/useRemoteState';
import { useSetConsent } from '@/features/remote/api/remoteMutations';
import { formatTime } from '@/shared/lib/format';
import {
  REMOTE_BACKGROUND_OPTIONS,
  REMOTE_POLL_OPTIONS,
  DEADMAN_OPTIONS,
} from './ServersSettingsCard.config';

export const ServersSettingsCard = () => {
  const dispatch = useAppDispatch();
  const pollMs = useAppSelector((s) => s.settings.remotePollIntervalMs);
  const bgMins = useAppSelector((s) => s.settings.remoteBackgroundMinutes);
  const deadmanMins = useAppSelector((s) => s.settings.remoteDeadmanMinutes);
  const state = useRemoteState();
  const consent = useSetConsent();
  const granted = state.data?.consent.granted ?? false;
  const since = state.data?.consent.grantedAtEpoch;

  return (
    <section className="rounded-xl p-6 text-card-foreground shadow-edge glass">
      <h2 className="font-display text-base font-semibold text-foreground">Servers</h2>
      <div className="mt-2 divide-y divide-hairline">
        <div className="flex items-center justify-between gap-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">Refresh</p>
            <p className="text-xs text-muted-foreground">
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
            <p className="text-sm font-medium text-foreground">Prod dead-man's switch</p>
            <p className="text-xs text-muted-foreground">
              Auto-disconnect idle prod control masters when locked, asleep, or idle. Never kills
              busy commands.
            </p>
          </div>
          <SegmentedControl
            ariaLabel="Prod dead-man's switch idle timeout"
            value={String(deadmanMins)}
            options={DEADMAN_OPTIONS}
            onChange={(v) => dispatch(setRemoteDeadmanMinutes(Number(v)))}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-foreground">Check in the background</p>
            <p className="text-xs text-muted-foreground">
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
            <p className="text-sm font-medium text-foreground">SSH config access</p>
            <p className="text-xs text-muted-foreground">
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
