import { toast } from 'sonner';
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
  Download,
  Upload,
  AlertTriangle,
  FileUp,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Spinner } from '@/shared/ui/Spinner';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Dialog } from '@/shared/ui/Dialog';
import { formatBytes } from '@/shared/lib/format';
import type { RemoteHost, RemoteFileEntry } from '@/features/remote/api/remote.schema';
import {
  useRemoteFiles,
  useRemoteFileContent,
  useRemoteDownloadFile,
  useRemoteUploadFile,
} from '@/features/remote/api/useRemoteFiles';

interface Props {
  host: RemoteHost;
  connected: boolean;
}

export const FilesBrowser = ({ host, connected }: Props) => {
  const [currentPath, setCurrentPath] = useState('/var/log');
  const [selectedFile, setSelectedFile] = useState<RemoteFileEntry | null>(null);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [localSource, setLocalSource] = useState('');
  const [uploadDestFilename, setUploadDestFilename] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [prodConfirm, setProdConfirm] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

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

  const downloadFile = useRemoteDownloadFile();
  const uploadFile = useRemoteUploadFile();

  const isProd = host.env === 'prod';

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

  const handleDownload = async (file: RemoteFileEntry) => {
    try {
      setIsDownloading(true);
      const saved = await downloadFile(host.id, file.path);
      toast.success(`Saved to ${saved.replace(/^\/Users\/[^/]+/, '~')}`);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleStartUpload = () => {
    setLocalSource('');
    setUploadDestFilename('');
    setOverwrite(false);
    setProdConfirm('');
    setUploadError(null);
    setUploadOpen(true);
  };

  const handleExecuteUpload = async () => {
    if (!localSource.trim()) {
      setUploadError('Please specify a local file path');
      return;
    }
    const filename = uploadDestFilename.trim() || localSource.split('/').pop() || 'upload.dat';
    const remoteDest = currentPath.endsWith('/')
      ? `${currentPath}${filename}`
      : `${currentPath}/${filename}`;

    const alreadyExists = files?.some((f) => f.name === filename);
    if (alreadyExists && !overwrite) {
      setUploadError(
        `File '${filename}' already exists on remote host. Check Overwrite to replace it.`,
      );
      return;
    }

    if (isProd && prodConfirm !== 'UPLOAD') {
      setUploadError('Production upload requires typing UPLOAD to confirm');
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);
      await uploadFile(
        host.id,
        localSource.trim(),
        remoteDest,
        overwrite,
        isProd ? prodConfirm : undefined,
      );
      setUploadOpen(false);
      void refetch();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsUploading(false);
    }
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

        {/* Quick jump bookmarks & Upload action */}
        <div className="flex items-center gap-2 text-xs">
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="text-fg-subtle">Quick:</span>
            {['/var/log', '/etc', '/home'].map((b) => (
              <button
                key={b}
                type="button"
                className="cursor-pointer rounded border border-hairline bg-card px-2 py-0.5 font-mono text-xs text-fg-muted hover:text-fg"
                onClick={() => handleNavigate(b)}
              >
                {b}
              </button>
            ))}
          </div>

          <Button
            variant="ember"
            size="sm"
            onClick={handleStartUpload}
            disabled={!connected}
            className="gap-1.5 text-xs"
            title="Upload local file to this directory"
          >
            <Upload className="size-3.5" />
            Upload File
          </Button>
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
                      <Folder className="size-4 shrink-0 text-warning" />
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
                    <span className="w-32 truncate text-right">{file.modified || '-'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* File Preview Pane */}
        {selectedFile && (
          <div className="flex min-h-0 w-1/2 flex-col border-l border-hairline bg-card/40 backdrop-blur-md">
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(selectedFile)}
                  disabled={isDownloading}
                  title="Download file via scp to /tmp"
                >
                  {downloadSuccess ? (
                    <Check className="size-3.5 text-success" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy file content">
                  {copied ? (
                    <Check className="size-3.5 text-success" />
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

      {/* Upload Dialog with Overwrite & Prod Type-Confirm */}
      <Dialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        title="Upload File via SFTP"
        description={`Upload a local file to ${currentPath} on ${host.label}`}
      >
        <div className="flex flex-col gap-4 py-2">
          {isProd && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-danger-soft p-3 text-xs text-destructive">
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
              <div>
                <span className="font-semibold text-destructive">Production Server Warning:</span>
                <p className="mt-0.5">
                  Uploading files to production servers modifies live systems. You must type{' '}
                  <strong className="font-mono text-white">UPLOAD</strong> to authorize.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="local-source-input" className="text-xs font-medium text-fg">
              Local Source File Path
            </label>
            <input
              id="local-source-input"
              type="text"
              placeholder="/Users/.../config.json"
              value={localSource}
              onChange={(e) => setLocalSource(e.target.value)}
              className="h-8 rounded-lg border border-hairline bg-canvas px-3 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="remote-dest-input" className="text-xs font-medium text-fg">
              Remote Destination Filename
            </label>
            <input
              id="remote-dest-input"
              type="text"
              placeholder="Leave blank to use source filename"
              value={uploadDestFilename}
              onChange={(e) => setUploadDestFilename(e.target.value)}
              className="h-8 rounded-lg border border-hairline bg-canvas px-3 font-mono text-xs text-fg focus:ring-1 focus:ring-primary focus:outline-none"
            />
            <span className="font-mono text-[11px] text-fg-subtle">
              Destination: {currentPath.endsWith('/') ? currentPath : `${currentPath}/`}
              {uploadDestFilename || localSource.split('/').pop() || '<filename>'}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-fg">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="rounded border-hairline text-primary focus:ring-primary"
            />
            <span>Overwrite file if it already exists on remote server</span>
          </label>

          {isProd && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="prod-confirm-input" className="text-xs font-medium text-destructive">
                Type <span className="font-mono font-bold text-white">UPLOAD</span> to confirm
              </label>
              <input
                id="prod-confirm-input"
                type="text"
                placeholder="UPLOAD"
                value={prodConfirm}
                onChange={(e) => setProdConfirm(e.target.value)}
                className="h-8 rounded-lg border border-destructive/50 bg-canvas px-3 font-mono text-xs text-fg focus:ring-1 focus:ring-destructive focus:outline-none"
              />
            </div>
          )}

          {uploadError && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-xs text-danger">
              {uploadError}
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={isProd ? 'destructive' : 'ember'}
              size="sm"
              disabled={isUploading || (isProd && prodConfirm !== 'UPLOAD')}
              onClick={() => void handleExecuteUpload()}
              className="gap-1.5"
            >
              {isUploading ? <Spinner className="size-3.5" /> : <FileUp className="size-3.5" />}
              {isUploading ? 'Uploading...' : 'Confirm Upload'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
