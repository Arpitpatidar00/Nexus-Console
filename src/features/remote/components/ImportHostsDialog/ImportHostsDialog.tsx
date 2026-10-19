import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Checkbox } from '@/shared/ui/Checkbox';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Spinner } from '@/shared/ui/Spinner';
import { useRemoteScan, useRemoteState } from '@/features/remote/api/useRemoteState';
import { useImportHosts, useSetConsent } from '@/features/remote/api/remoteMutations';
import type { HostEnv, ScannedHost } from '@/features/remote/api/remote.schema';
import { projectNames } from '@/features/remote/utils/grouping';
import { guessEnv } from '@/features/remote/utils/host';
import { ConsentCopy } from '@/features/remote/components/ConsentPanel';
import { ENV_OPTIONS, ProjectField, inputCls } from '@/features/remote/components/HostFields';

interface Row {
  checked: boolean;
  project: string;
  env: HostEnv;
}

const via = (h: ScannedHost) =>
  `${h.user}@${h.hostname}${h.port === 22 ? '' : `:${h.port}`}${h.proxyJump ? ` via ${h.proxyJump}` : ''}`;

export const ImportHostsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const state = useRemoteState();
  const granted = state.data?.consent.granted ?? false;
  const consent = useSetConsent();
  const scan = useRemoteScan(open && granted);
  const importHosts = useImportHosts();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [project, setProject] = useState('');
  const suggestions = projectNames(state.data?.hosts ?? []);

  const rowFor = (h: ScannedHost): Row =>
    rows[h.alias] ?? { checked: false, project: '', env: guessEnv(h.alias) };
  const patch = (alias: string, h: ScannedHost, p: Partial<Row>) =>
    setRows((r) => ({ ...r, [alias]: { ...rowFor(h), ...p } }));

  const candidates = (scan.data ?? []).filter((h) => !h.imported);
  const chosen = candidates.filter((h) => rowFor(h).checked);

  const close = (o: boolean) => {
    if (!o) {
      setRows({});
      setProject('');
      importHosts.reset();
    }
    onOpenChange(o);
  };

  const submit = () =>
    importHosts.mutate(
      chosen.map((h) => {
        const r = rowFor(h);
        return { alias: h.alias, env: r.env, project: (r.project || project).trim() || undefined };
      }),
      { onSuccess: () => close(false) },
    );

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Import from SSH config"
      description="Pick the hosts to show, and label each with a project and environment."
    >
      {!granted ? (
        <div className="space-y-4">
          <ConsentCopy />
          <div className="flex justify-end">
            <Button onClick={() => consent.mutate(true)} disabled={consent.isPending}>
              Allow reading SSH config
            </Button>
          </div>
        </div>
      ) : scan.isPending ? (
        <div aria-hidden className="space-y-3 py-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-list" />
          ))}
        </div>
      ) : scan.isError ? (
        <ErrorPanel
          error={scan.error}
          fallback="Couldn't read your SSH config"
          onRetry={() => void scan.refetch()}
        />
      ) : candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {(scan.data?.length ?? 0) > 0
            ? 'Every host in your SSH config is already added.'
            : 'No hosts found in ~/.ssh/config. Wildcard entries like "Host *" are skipped.'}
        </p>
      ) : (
        <div className="flex min-h-0 flex-col gap-3">
          <ProjectField value={project} onChange={setProject} suggestions={suggestions} />
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {candidates.map((h) => {
              const r = rowFor(h);
              return (
                <li key={h.alias} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    ariaLabel={`Import ${h.alias}`}
                    checked={r.checked}
                    onChange={(checked) => patch(h.alias, h, { checked })}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{h.alias}</p>
                    <p className="truncate font-mono text-xs text-fg-subtle">{via(h)}</p>
                  </div>
                  <select
                    aria-label={`Environment for ${h.alias}`}
                    value={r.env}
                    onChange={(e) => patch(h.alias, h, { env: e.target.value as HostEnv })}
                    className={`${inputCls} h-8 w-28 px-2`}
                  >
                    {ENV_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          {importHosts.isError && <ErrorPanel error={importHosts.error} fallback="Import failed" />}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const all = chosen.length < candidates.length;
                setRows((prev) =>
                  Object.fromEntries(
                    candidates.map((h) => [
                      h.alias,
                      { ...(prev[h.alias] ?? rowFor(h)), checked: all },
                    ]),
                  ),
                );
              }}
            >
              {chosen.length < candidates.length ? 'Select all' : 'Select none'}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={chosen.length === 0 || importHosts.isPending}
                onClick={submit}
              >
                {importHosts.isPending && <Spinner className="text-current" />}
                Add {chosen.length || ''} server{chosen.length === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
};
