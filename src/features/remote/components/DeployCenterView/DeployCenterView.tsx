import { useState } from 'react';
import { Rocket, History, Layers, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import type { HostSnapshot, RemoteHost } from '@/features/remote/api/remote.schema';
import {
  useDeployHistory,
  useDeployPreview,
  useExecuteDeploy,
  useRollbackDeploy,
} from '@/features/remote/api/useDeploys';

interface Props {
  host: RemoteHost;
  snapshot: HostSnapshot;
  connected: boolean;
}

export const DeployCenterView = ({ host, snapshot, connected }: Props) => {
  const initialProject = snapshot.composeProjects[0]?.name || 'default';
  const [selectedProject, setSelectedProject] = useState(initialProject);
  const [deployLogs, setDeployLogs] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: preview, isFetching: previewLoading } = useDeployPreview(
    host.id,
    selectedProject,
    connected && !!selectedProject,
  );
  const { data: history, isLoading: historyLoading } = useDeployHistory(host.id);
  const executeDeploy = useExecuteDeploy(host.id);
  const rollbackDeploy = useRollbackDeploy(host.id);

  const handleDeploy = () => {
    setActionError(null);
    executeDeploy.mutate(
      { project: selectedProject },
      {
        onSuccess: (res) => setDeployLogs(res.logs),
        onError: (err) => setActionError(err.message),
      },
    );
  };

  const handleRollback = (deployId: string) => {
    setActionError(null);
    rollbackDeploy.mutate(deployId, {
      onSuccess: (res) => setDeployLogs(res.logs),
      onError: (err) => setActionError(err.message),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Top Action Bar */}
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Rocket className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-fg">Deploy & Rollback Center</h3>
            <p className="text-xs text-fg-subtle">
              Pull, deploy, and rollback container images for compose stacks on {host.label}
            </p>
          </div>
        </div>

        {/* Stack selector */}
        {snapshot.composeProjects.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="deploy-stack-select" className="text-xs font-medium text-fg-subtle">
              Stack:
            </label>
            <select
              id="deploy-stack-select"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="rounded-lg border border-hairline bg-canvas px-3 py-1.5 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none"
            >
              {snapshot.composeProjects.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {actionError && (
        <div className="rounded-xl border border-destructive/30 bg-danger-soft p-3 text-xs text-destructive">
          {actionError}
        </div>
      )}

      {/* Deploy Preview & Trigger Card */}
      <div className="rounded-2xl border border-hairline bg-card/50 p-5 shadow-sm">
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h4 className="text-sm font-semibold text-fg">Deploy Preview: {selectedProject}</h4>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={!connected || !preview?.hasChanges || executeDeploy.isPending}
            onClick={handleDeploy}
          >
            {executeDeploy.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Rocket className="mr-1.5 size-3.5" />
            )}
            {executeDeploy.isPending ? 'Deploying…' : `Deploy ${selectedProject}`}
          </Button>
        </div>

        {previewLoading ? (
          <div className="py-6 text-center">
            <Spinner className="mx-auto size-5 text-primary" />
            <p className="mt-2 text-xs text-fg-subtle">Checking image digests on host...</p>
          </div>
        ) : !preview || preview.servicesToUpdate.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-canvas/60 p-4 text-center text-xs text-fg-subtle">
            No compose service images configured for stack "{selectedProject}".
          </div>
        ) : (
          <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {preview.servicesToUpdate.map((s) => (
              <div
                key={s.service}
                className="flex items-center justify-between p-3.5 font-mono text-xs"
              >
                <div>
                  <span className="font-semibold text-fg">{s.service}</span>
                  <p className="mt-0.5 max-w-md truncate text-fg-subtle">
                    Current Digest:{' '}
                    {s.digestBefore ? s.digestBefore.slice(0, 19) + '...' : 'unknown'}
                  </p>
                </div>
                <Badge variant="neutral">Ready to Pull</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deploy Logs Output if present */}
      {deployLogs && (
        <div className="rounded-2xl border border-hairline bg-card/50 p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-semibold text-fg">Deploy Command Output</span>
            <button
              type="button"
              className="cursor-pointer text-xs text-fg-subtle hover:text-fg"
              onClick={() => setDeployLogs(null)}
            >
              Clear
            </button>
          </div>
          <pre className="max-h-48 overflow-auto rounded-xl border border-hairline bg-canvas p-3 font-mono text-xs whitespace-pre-wrap text-fg-muted">
            {deployLogs}
          </pre>
        </div>
      )}

      {/* Historical Deploys & Rollback */}
      <div className="rounded-2xl border border-hairline bg-card/50 p-5 shadow-sm">
        <div className="flex items-center gap-2 pb-3">
          <History className="size-4 text-primary" />
          <h4 className="text-sm font-semibold text-fg">Deployment History & Rollback Points</h4>
        </div>

        {historyLoading ? (
          <div className="py-6 text-center">
            <Spinner className="mx-auto size-5 text-primary" />
          </div>
        ) : !history || history.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-subtle">
            No previous deployments recorded for this host.
          </div>
        ) : (
          <div className="divide-y divide-hairline rounded-xl border border-hairline bg-canvas/60">
            {history.map((record) => (
              <div key={record.id} className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-semibold text-fg">{record.id}</span>
                    <Badge variant={record.status === 'success' ? 'success' : 'neutral'}>
                      {record.status}
                    </Badge>
                    <span className="text-xs text-fg-subtle">
                      {new Date(record.deployedAt * 1000).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{record.message}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !connected || record.status === 'rolledBack' || rollbackDeploy.isPending
                  }
                  onClick={() => handleRollback(record.id)}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {rollbackDeploy.isPending ? 'Rolling back…' : 'Roll back to this'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
