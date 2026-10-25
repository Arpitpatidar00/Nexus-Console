import { useState } from 'react';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import type { DbConnection } from '@/features/databases/api/databases.schema';
import {
  useDbCustomMappings,
  useSaveDbCustomMapping,
  useDeleteDbCustomMapping,
} from '@/features/databases/api/useDatabases';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  connections: DbConnection[];
}

export function CustomMappingsDialog({ open, onOpenChange, groupId, connections }: Props) {
  const { data: mappings = [], isLoading } = useDbCustomMappings(groupId);
  const saveMapping = useSaveDbCustomMapping();
  const deleteMapping = useDeleteDbCustomMapping();

  const [isAdding, setIsAdding] = useState(false);
  const [srcConnId, setSrcConnId] = useState('');
  const [srcTable, setSrcTable] = useState('');
  const [srcCol, setSrcCol] = useState('');
  const [tgtConnId, setTgtConnId] = useState('');
  const [tgtTable, setTgtTable] = useState('');
  const [tgtCol, setTgtCol] = useState('');
  const [notes, setNotes] = useState('');

  const connMap = new Map(connections.map((c) => [c.id, c.name]));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) {
      toast.error('Select a specific group to save custom mappings.');
      return;
    }
    if (
      !srcConnId ||
      !srcTable.trim() ||
      !srcCol.trim() ||
      !tgtConnId ||
      !tgtTable.trim() ||
      !tgtCol.trim()
    ) {
      toast.error('Please fill in all connection, table, and column fields.');
      return;
    }

    const sParts = srcTable.trim().split('.');
    const srcSchema = sParts.length > 1 ? sParts[0] : 'public';
    const sTable = sParts.length > 1 ? sParts.slice(1).join('.') : sParts[0];

    const tParts = tgtTable.trim().split('.');
    const tgtSchema = tParts.length > 1 ? tParts[0] : 'public';
    const tTable = tParts.length > 1 ? tParts.slice(1).join('.') : tParts[0];

    saveMapping.mutate(
      {
        groupId,
        sourceConnectionId: srcConnId,
        sourceSchema: srcSchema,
        sourceTable: sTable,
        sourceColumn: srcCol.trim(),
        targetConnectionId: tgtConnId,
        targetSchema: tgtSchema,
        targetTable: tTable,
        targetColumn: tgtCol.trim(),
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Custom mapping saved.');
          setIsAdding(false);
          setSrcTable('');
          setSrcCol('');
          setTgtTable('');
          setTgtCol('');
          setNotes('');
        },
        onError: (err) => {
          toast.error(`Failed to save mapping: ${(err as Error).message}`);
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteMapping.mutate(
      { id, groupId },
      {
        onSuccess: () => toast.info('Mapping deleted.'),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Configured Cross-Database Mappings"
      description="Explicit application relationships configured for this workspace. These persist independently from automatic heuristics."
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <span className="text-xs text-muted-foreground">
            {mappings.length} configured relationship{mappings.length === 1 ? '' : 's'}
          </span>
          <Button variant="outline" size="sm" onClick={() => setIsAdding(!isAdding)}>
            <Plus className="mr-1 size-3.5" />
            {isAdding ? 'Cancel' : 'Add Custom Mapping'}
          </Button>
        </div>

        {isAdding && (
          <form
            onSubmit={handleSave}
            className="space-y-3 rounded-lg border border-hairline bg-muted/40 p-3.5"
          >
            <h4 className="text-xs font-semibold text-fg">New Application Relationship</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label
                  htmlFor="custom-mapping-source-conn"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Source Connection
                </label>
                <select
                  id="custom-mapping-source-conn"
                  value={srcConnId}
                  onChange={(e) => setSrcConnId(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-fg outline-none"
                  required
                >
                  <option value="">Select source database...</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.driver})
                    </option>
                  ))}
                </select>
                <Field label="Source Table (e.g. orders)">
                  <Input
                    value={srcTable}
                    onChange={(e) => setSrcTable(e.target.value)}
                    placeholder="public.orders"
                    required
                  />
                </Field>
                <Field label="Source Column">
                  <Input
                    value={srcCol}
                    onChange={(e) => setSrcCol(e.target.value)}
                    placeholder="user_id"
                    required
                  />
                </Field>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="custom-mapping-target-conn"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Target Connection
                </label>
                <select
                  id="custom-mapping-target-conn"
                  value={tgtConnId}
                  onChange={(e) => setTgtConnId(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-fg outline-none"
                  required
                >
                  <option value="">Select target database...</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.driver})
                    </option>
                  ))}
                </select>
                <Field label="Target Table (e.g. users)">
                  <Input
                    value={tgtTable}
                    onChange={(e) => setTgtTable(e.target.value)}
                    placeholder="public.users"
                    required
                  />
                </Field>
                <Field label="Target Column">
                  <Input
                    value={tgtCol}
                    onChange={(e) => setTgtCol(e.target.value)}
                    placeholder="id"
                    required
                  />
                </Field>
              </div>
            </div>

            <Field label="Notes (optional)">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Microservice boundary reference..."
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="ember" size="sm" disabled={saveMapping.isPending}>
                Save Mapping
              </Button>
            </div>
          </form>
        )}

        <div className="max-h-[50vh] space-y-2.5 overflow-y-auto pr-1">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading mappings…</p>
          ) : mappings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No custom mappings configured for this group. Confirm ambiguous suggestions or add one
              manually above.
            </p>
          ) : (
            mappings.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-hairline bg-canvas p-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">
                      {connMap.get(m.sourceConnectionId) ?? m.sourceConnectionId}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {m.sourceTable}.{m.sourceColumn}
                    </span>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <span className="font-semibold text-fg">
                      {connMap.get(m.targetConnectionId) ?? m.targetConnectionId}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {m.targetTable}.{m.targetColumn}
                    </span>
                  </div>
                  {m.notes && <p className="text-[11px] text-muted-foreground">{m.notes}</p>}
                </div>

                <Button
                  variant="ghost"
                  size="iconSm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(m.id)}
                  title="Delete this custom mapping"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
