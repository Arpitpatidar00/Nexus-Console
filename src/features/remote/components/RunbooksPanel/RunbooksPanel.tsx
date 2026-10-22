import { useState } from 'react';
import { Terminal, Plus, Trash2, Play, Copy, Check, BookOpen } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Dialog } from '@/shared/ui/Dialog';
import { Field, Input, Textarea } from '@/shared/ui/Field';
import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useRunbooks, useAddRunbook, useRemoveRunbook } from '@/features/remote/api/useRunbooks';

interface Props {
  host: RemoteHost;
}

export const RunbooksPanel = ({ host }: Props) => {
  const dispatch = useAppDispatch();
  const { data: runbooks, isLoading } = useRunbooks(host.id, host.project);
  const addRunbook = useAddRunbook();
  const removeRunbook = useRemoveRunbook();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [desc, setDesc] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleRun = (cmd: string, rbName: string) => {
    // Open the terminal shell
    dispatch(
      openTerminal({
        target: { type: 'remoteShell', hostId: host.id },
        title: `${host.label} — ${rbName}`,
      }),
    );
    // Copy the command for rapid pasting
    void navigator.clipboard.writeText(cmd);
  };

  const handleCopy = (id: string, cmd: string) => {
    void navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;
    await addRunbook.mutateAsync({
      hostId: host.id,
      project: host.project,
      name: name.trim(),
      command: command.trim(),
      description: desc.trim() || null,
    });
    setName('');
    setCommand('');
    setDesc('');
    setDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-12">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-fg">Saved Server Runbooks</h3>
            <p className="text-xs text-fg-subtle">
              Curated commands and operational scripts ready to run on {host.label}
            </p>
          </div>
        </div>

        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />
          New Runbook
        </Button>
      </div>

      {!runbooks || runbooks.length === 0 ? (
        <div className="p-8">
          <EmptyState
            icon={<Terminal className="h-8 w-8 text-fg-subtle" />}
            title="No runbooks saved"
            description="Create reusable commands to quickly run backups, log dumps, or health checks."
          />
        </div>
      ) : (
        <div className="divide-y divide-hairline rounded-2xl border border-hairline bg-card/50 shadow-sm backdrop-blur-sm">
          {runbooks.map((rb) => (
            <div key={rb.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-fg">{rb.name}</span>
                </div>
                {rb.description && (
                  <p className="mt-0.5 text-xs text-fg-subtle">{rb.description}</p>
                )}
                <pre className="mt-2 max-w-2xl overflow-x-auto rounded-lg border border-hairline bg-canvas/80 p-2 font-mono text-xs text-fg-muted">
                  {rb.command}
                </pre>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(rb.id, rb.command)}
                  title="Copy command to clipboard"
                >
                  {copiedId === rb.id ? (
                    <Check className="size-3.5 text-success" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleRun(rb.command, rb.name)}
                  title="Open terminal shell for this host"
                >
                  <Play className="mr-1.5 size-3.5 text-success" />
                  Run
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removeRunbook.isPending}
                  onClick={() => removeRunbook.mutate(rb.id)}
                  title="Delete runbook"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Create server runbook"
        description="A saved command you can run on this server with one click."
        size="md"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Field label="Title" htmlFor="runbook-name-input">
            <Input
              id="runbook-name-input"
              required
              placeholder="e.g. Restart production nginx"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Shell command" htmlFor="runbook-cmd-input">
            <Textarea
              id="runbook-cmd-input"
              required
              mono
              rows={3}
              placeholder="e.g. sudo nginx -t && sudo systemctl restart nginx"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="Optional — what this command does."
            htmlFor="runbook-desc-input"
          >
            <Input
              id="runbook-desc-input"
              placeholder="Brief note"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addRunbook.isPending}>
              {addRunbook.isPending ? 'Saving…' : 'Save runbook'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
