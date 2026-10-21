import { useState } from 'react';
import { Rocket, Layers, Copy, Check } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useProjectReleaseConfig } from '../api/useReleases';

export const ReleasesPage = () => {
  const [projectPath, setProjectPath] = useState('/Users/devarpit/Desktop/chat-app');
  const [copiedLane, setCopiedLane] = useState<string | null>(null);

  const { data: releaseConfig, isLoading } = useProjectReleaseConfig(projectPath);

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
            <Rocket className="h-6 w-6 text-pink-400" />
            Release Config
          </h1>
          <p className="text-muted-fg mt-1 text-xs">
            Local Fastlane deployment lanes, version names, and build numbers.
          </p>
        </div>

        {/* Project Path Picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="releases-project-path" className="text-muted-fg text-xs font-semibold">
            Project:
          </label>
          <input
            id="releases-project-path"
            type="text"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            className="w-64 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-fg focus:outline-none"
          />
        </div>
      </div>

      {/* Release Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
          <span className="text-muted-fg text-xs font-semibold tracking-wider uppercase">
            Detected Platform
          </span>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="default" className="text-xs uppercase">
              {releaseConfig?.platform || 'Detecting...'}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
          <span className="text-muted-fg text-xs font-semibold tracking-wider uppercase">
            Version & Build
          </span>
          <div className="mt-1 font-mono text-lg font-bold text-fg">
            v{releaseConfig?.version_name || '1.0.0'}
            {releaseConfig?.build_number && (
              <span className="text-muted-fg ml-1.5 text-xs font-normal">
                (build {releaseConfig.build_number})
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
          <span className="text-muted-fg text-xs font-semibold tracking-wider uppercase">
            Fastlane Status
          </span>
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
          <Layers className="h-4 w-4 text-pink-400" />
          Release & Deployment Lanes
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="text-muted-fg border-b border-border bg-muted/40 font-semibold">
              <th className="px-4 py-3">Lane Name</th>
              <th className="px-4 py-3">Execution Command</th>
              <th className="px-4 py-3 text-right">Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="text-muted-fg px-4 py-8 text-center">
                  Scanning project fastlane configurations...
                </td>
              </tr>
            ) : !releaseConfig?.lanes || releaseConfig.lanes.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-muted-fg px-4 py-8 text-center">
                  No Fastlane lanes found in this project. Create a `fastlane/Fastfile` to automate
                  builds.
                </td>
              </tr>
            ) : (
              releaseConfig.lanes.map((lane) => (
                <tr key={lane} className="transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono font-semibold text-fg">{lane}</td>
                  <td className="text-muted-fg px-4 py-3 font-mono">bundle exec fastlane {lane}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyLaneCommand(lane)}
                      className="text-muted-fg text-xs hover:text-fg"
                    >
                      {copiedLane === lane ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
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

      {/* Privacy & Scope Line */}
      <div className="text-muted-fg flex items-center gap-2 rounded-lg border border-border bg-card/30 p-3 text-xs">
        <span className="font-semibold text-fg">Privacy & Scope:</span> Reads local pubspec.yaml,
        package.json, and Fastfiles only. No external store accounts or telemetry used.
      </div>
    </div>
  );
};
