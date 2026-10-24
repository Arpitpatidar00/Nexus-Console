import { useState } from 'react';
import { Rocket, Layers, Copy, Check } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useProjectReleaseConfig } from '../api/useReleases';
import { useProjects } from '@/features/projects/api/useProjects';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Input } from '@/shared/ui/Field';
import { useModuleEnabled } from '@/shared/modules';

export const ReleasesPage = () => {
  // Projects off → no discovery call (the module gate answered it with a red
  // Forbidden toast); the path field still works by hand.
  const projectsOn = useModuleEnabled('projects');
  const { data: projects } = useProjects([], { enabled: projectsOn });
  // null = not edited yet → follow the first discovered project. Once edited
  // (even to ''), the field is the user's — it used to snap back when cleared.
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [copiedLane, setCopiedLane] = useState<string | null>(null);

  const activePath = projectPath ?? projects?.[0]?.path ?? '';
  const { data: releaseConfig, isLoading, error, refetch } = useProjectReleaseConfig(activePath);

  const handleCopyLaneCommand = (lane: string) => {
    navigator.clipboard.writeText(`bundle exec fastlane ${lane}`);
    setCopiedLane(lane);
    setTimeout(() => setCopiedLane(null), 2000);
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 text-fg">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Rocket className="h-6 w-6 text-destructive" />
            Release Config
          </h1>
          <p className="mt-1 text-xs text-fg-muted">
            Local Fastlane deployment lanes, version names, and build numbers.
          </p>
        </div>

        {/* Project Path Picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="releases-project-path" className="text-xs font-semibold text-fg-muted">
            Project:
          </label>
          <Input
            id="releases-project-path"
            size="sm"
            mono
            list="releases-project-options"
            placeholder="/path/to/project"
            value={activePath}
            onChange={(e) => setProjectPath(e.target.value)}
            className="w-72"
          />
          <datalist id="releases-project-options">
            {projects?.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
          </datalist>
        </div>
      </div>

      {/* Release Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
          <span className="text-xs font-semibold text-fg-muted">Detected Platform</span>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="default" className="text-xs uppercase">
              {releaseConfig?.platform || 'Detecting...'}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
          <span className="text-xs font-semibold text-fg-muted">Version & Build</span>
          <div className="mt-1 font-mono text-lg font-bold text-fg">
            v{releaseConfig?.version_name || '1.0.0'}
            {releaseConfig?.build_number && (
              <span className="ml-1.5 text-xs font-normal text-fg-muted">
                (build {releaseConfig.build_number})
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
          <span className="text-xs font-semibold text-fg-muted">Fastlane Status</span>
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant={releaseConfig?.has_fastlane ? 'success' : 'neutral'}
              className="text-xs"
            >
              {releaseConfig?.has_fastlane ? 'Fastfile Configured' : 'No Fastfile'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Fastlane Lanes Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-3 text-xs font-semibold text-fg">
          <Layers className="h-4 w-4 text-destructive" />
          Release & Deployment Lanes
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-semibold text-fg-muted">
              <th className="px-4 py-3">Lane Name</th>
              <th className="px-4 py-3">Execution Command</th>
              <th className="px-4 py-3 text-right">Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {error ? (
              <tr>
                <td colSpan={3} className="p-4">
                  <ErrorPanel
                    error={error}
                    fallback="Couldn't read this project's release config."
                    onRetry={() => void refetch()}
                  />
                </td>
              </tr>
            ) : isLoading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-fg-muted">
                  Scanning project fastlane configurations...
                </td>
              </tr>
            ) : !releaseConfig?.lanes || releaseConfig.lanes.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-fg-muted">
                  No Fastlane lanes found in this project. Create a `fastlane/Fastfile` to automate
                  builds.
                </td>
              </tr>
            ) : (
              releaseConfig.lanes.map((lane) => (
                <tr key={lane} className="transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono font-semibold text-fg">{lane}</td>
                  <td className="px-4 py-3 font-mono text-fg-muted">bundle exec fastlane {lane}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyLaneCommand(lane)}
                      className="text-xs text-fg-muted hover:text-fg"
                    >
                      {copiedLane === lane ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
