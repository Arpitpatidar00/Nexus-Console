import { useState } from 'react';
import {
  Folder,
  FileText,
  ChevronRight,
  ArrowUp,
  Eye,
  EyeOff,
  Copy,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { formatBytes } from '@/shared/lib/format';
import type { RemoteHost, RemoteFileEntry } from '@/features/remote/api/remote.schema';
import { useRemoteFiles, useRemoteFileContent } from '@/features/remote/api/useRemoteFiles';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

export const FilesBrowser = ({ host, connected }: Props) => {
  const [currentPath, setCurrentPath] = useState('/var/log');
  const [selectedFile, setSelectedFile] = useState<RemoteFileEntry | null>(null);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    data: files,
    isLoading,
    error,
    refetch,
  } = useRemoteFiles(host.id, currentPath, connected);
  const { data: fileContent, isLoading: isReading } = useRemoteFileContent(
    host.id,
    selectedFile ? selectedFile.path : null,
    revealSecrets,
    connected && !!selectedFile,
  );

  const handleNavigate = (newPath: string) => {
    setSelectedFile(null);
    setCurrentPath(newPath);
  };

  const handleUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const up = '/' + parts.join('/');
    handleNavigate(up === '' ? '/' : up);
  };

  const handleCopy = () => {
    if (!fileContent) return;
    void navigator.clipboard.writeText(fileContent.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Path Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-hairline bg-muted/20 px-6 py-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto font-mono text-xs">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPath === '/'}
            onClick={handleUp}
            className="h-7 px-2"
            title="Go up one folder"
          >
            <ArrowUp className="size-3.5" />
          </Button>

          <button
            type="button"
            className="cursor-pointer rounded px-1.5 py-0.5 text-fg hover:bg-muted"
            onClick={() => handleNavigate('/')}
          >
            root
          </button>

          {breadcrumbs.map((crumb, idx) => {
            const pathUpTo = '/' + breadcrumbs.slice(0, idx + 1).join('/');
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <div key={pathUpTo} className="flex items-center gap-1">
                <ChevronRight className="size-3 text-fg-subtle" />
                <button
                  type="button"
                  className={`cursor-pointer rounded px-1.5 py-0.5 ${
                    isLast ? 'font-semibold text-primary' : 'text-fg-muted hover:bg-muted'
                  }`}
                  onClick={() => handleNavigate(pathUpTo)}
                >
                  {crumb}
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick jump bookmarks */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-fg-subtle">Quick:</span>
          {['/var/log', '/etc', '/home'].map((b) => (
            <button
              key={b}
              type="button"
              className="bg-surface cursor-pointer rounded border border-hairline px-2 py-0.5 font-mono text-xs text-fg-muted hover:text-fg"
              onClick={() => handleNavigate(b)}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area: Split View when file is selected */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Directory List */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {isLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-12">
              <Spinner className="size-6 text-primary" />
            </div>
          ) : error ? (
            <div className="p-6">
              <ErrorPanel
                error={error}
                fallback="Failed to load remote directory"
                onRetry={() => void refetch()}
              />
            </div>
          ) : !files || files.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<Folder className="h-8 w-8 text-fg-subtle" />}
                title="Directory is empty"
                description={`No files or directories found in ${currentPath}`}
              />
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {files.map((file) => (
                <button
                  type="button"
                  key={file.path}
                  onClick={() => {
                    if (file.isDir) {
                      handleNavigate(file.path);
                    } else {
                      setSelectedFile(file);
                    }
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between px-6 py-2.5 text-left text-xs transition-colors hover:bg-muted/30 ${
                    selectedFile?.path === file.path ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {file.isDir ? (
                      <Folder className="size-4 shrink-0 text-amber-500" />
                    ) : (
                      <FileText className="size-4 shrink-0 text-fg-subtle" />
                    )}
                    <span className="truncate font-mono font-medium text-fg">{file.name}</span>
                  </div>

                  <div className="flex items-center gap-6 font-mono text-fg-subtle">
                    <span className="w-20 text-right">
                      {file.isDir ? '<DIR>' : formatBytes(file.sizeBytes)}
                    </span>
                    <span className="w-24 text-center">{file.permissions}</span>
                    <span className="w-32 truncate text-right">{file.modified}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* File Preview Pane */}
        {selectedFile && (
          <div className="bg-surface/40 flex min-h-0 w-1/2 flex-col border-l border-hairline backdrop-blur-md">
            <div className="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm font-semibold text-fg">
                    {selectedFile.name}
                  </span>
                  {fileContent?.isSecret && (
                    <Badge variant="warning" className="gap-1">
                      <ShieldAlert className="size-3" />
                      Secrets Masked
                    </Badge>
                  )}
                </div>
                <span className="font-mono text-xs text-fg-subtle">
                  {selectedFile.path} • {formatBytes(selectedFile.sizeBytes)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {fileContent?.isSecret && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealSecrets(!revealSecrets)}
                    title={revealSecrets ? 'Mask secrets' : 'Reveal secrets'}
                  >
                    {revealSecrets ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    <span className="ml-1 text-xs">{revealSecrets ? 'Hide' : 'Reveal'}</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy file content">
                  {copied ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                  title="Close preview"
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {isReading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-5 text-primary" />
                </div>
              ) : fileContent ? (
                <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg">
                  {fileContent.content}
                </pre>
              ) : (
                <div className="text-center text-xs text-fg-subtle">
                  Unable to read file content
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
