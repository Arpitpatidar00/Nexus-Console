import { useState } from 'react';
import { FileEdit, Save, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { useHostNote, useSaveHostNote } from '@/features/remote/api/useHostNote';

interface Props {
  host: RemoteHost;
}

export const NotesTab = ({ host }: Props) => {
  const { data: note, isLoading, error, refetch } = useHostNote(host.id);
  const saveNote = useSaveHostNote(host.id);

  // Unsaved edits live in `draft`; otherwise the saved note shows. A refetch
  // can no longer wipe what's being typed.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? note?.content ?? '';
  const dirty = draft !== null;

  const handleSave = async () => {
    await saveNote.mutateAsync(text);
    // The mutation already put the saved note in the cache.
    setDraft(null);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-12">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={error}
          fallback="Failed to load host notes"
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const updatedTime = note?.updatedAtEpoch
    ? new Date(note.updatedAtEpoch * 1000).toLocaleString()
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
      <div className="flex shrink-0 items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <FileEdit className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-fg">Host Scratchpad & Runbook Notes</h3>
            <p className="text-xs text-fg-subtle">
              Private markdown notes, operational procedures, or credential hints stored locally for{' '}
              {host.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {updatedTime && (
            <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <Clock className="size-3.5" />
              <span>Saved {updatedTime}</span>
            </div>
          )}

          <Button size="sm" disabled={!dirty || saveNote.isPending} onClick={handleSave}>
            {saveNote.isSuccess && !dirty ? (
              <CheckCircle className="mr-1.5 size-3.5 text-success" />
            ) : (
              <Save className="mr-1.5 size-3.5" />
            )}
            {saveNote.isPending ? 'Saving...' : 'Save Notes'}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas/80 shadow-sm backdrop-blur-sm">
        <textarea
          value={text}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          placeholder="Write host notes, deployment guidelines, or recovery steps in Markdown here..."
          className="min-h-0 flex-1 resize-none border-none bg-transparent p-5 font-mono text-sm leading-relaxed text-fg focus:outline-none"
        />
      </div>
    </div>
  );
};
