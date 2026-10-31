import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Switch } from '@/shared/ui/Switch';
import { useUpdateDbConnection, useDbGroups } from '@/features/databases/api/useDatabases';
import type { DbConnection } from '@/features/databases/api/databases.schema';
import { ENGINES, type Engine } from '../AddConnectionDialog/AddConnectionDialog.config';

type Env = 'dev' | 'staging' | 'prod';

interface EditConnectionDialogProps {
  connection: DbConnection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditConnectionDialog = ({
  connection,
  open,
  onOpenChange,
}: EditConnectionDialogProps) => {
  const updateConn = useUpdateDbConnection();
  const { data: groups = [] } = useDbGroups();

  const [engine, setEngine] = useState<Engine>('postgres');
  const [name, setName] = useState('');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('5432');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [env, setEnv] = useState<Env>('dev');
  const [allowWrites, setAllowWrites] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);

  // Reset the form when a different connection is opened (React's "adjust
  // state on prop change": during render, not an effect's second pass).
  const [syncedFrom, setSyncedFrom] = useState<DbConnection | null>(null);
  if (connection && connection !== syncedFrom) {
    setSyncedFrom(connection);
    const eng = (
      connection.driver === 'mongodb'
        ? 'mongodb'
        : connection.driver === 'mongo'
          ? 'mongodb'
          : connection.driver === 'mysql'
            ? 'mysql'
            : connection.driver === 'redis'
              ? 'redis'
              : 'postgres'
    ) as Engine;

    setEngine(eng);
    setName(connection.name);
    setHost(connection.host);
    setPort(String(connection.port));
    setUser(connection.user ?? '');
    setPassword(''); // Blank means keep existing Keychain password
    setDatabase(connection.database ?? '');
    setDataDir(connection.dataDir ?? '');
    setEnv(connection.env as Env);
    setAllowWrites(connection.allowWrites);
    setGroupId(connection.groupId ?? null);
  }

  if (!connection) return null;

  const cfg = ENGINES[engine];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConn.mutate(
      {
        id: connection.id,
        name: name.trim() || connection.name,
        driver: engine,
        host: host.trim(),
        port: Number(port),
        user: cfg.user ? user.trim() || null : null,
        password: password.trim() ? password : undefined,
        database: database.trim() || null,
        tunnelId: connection.tunnelId,
        allowWrites: allowWrites && env !== 'prod',
        env,
        dataDir: cfg.dataDir ? dataDir.trim() || null : null,
        groupId: groupId || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit “${connection.name}”`}
      description="Update connection parameters without losing your saved password."
      size="md"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <SegmentedControl<Engine>
          ariaLabel="Database engine"
          value={engine}
          onChange={(e) => {
            setEngine(e);
            setPort(String(ENGINES[e].port));
          }}
          options={(Object.keys(ENGINES) as Engine[]).map((k) => ({
            value: k,
            label: ENGINES[k].label,
          }))}
        />

        <Field label="Name" htmlFor="edit-conn-name">
          <Input
            id="edit-conn-name"
            placeholder={connection.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Host" htmlFor="edit-conn-host">
            <Input
              id="edit-conn-host"
              required
              mono
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </Field>
          <Field label="Port" htmlFor="edit-conn-port">
            <Input
              id="edit-conn-port"
              required
              mono
              inputMode="numeric"
              pattern="[0-9]{1,5}"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {cfg.user && (
            <Field label="User" htmlFor="edit-conn-user">
              <Input
                id="edit-conn-user"
                autoComplete="off"
                placeholder={cfg.user.placeholder}
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </Field>
          )}
          <Field
            label="Password"
            hint="Leave blank to keep current saved password."
            htmlFor="edit-conn-password"
          >
            <Input
              id="edit-conn-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {cfg.database && (
            <Field label={cfg.database.label} hint={cfg.database.hint} htmlFor="edit-conn-db">
              <Input
                id="edit-conn-db"
                mono
                placeholder={cfg.database.placeholder}
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
              />
            </Field>
          )}
        </div>

        {cfg.dataDir && (
          <Field
            label="Data directory"
            hint="Optional — enables instant APFS branches of this database."
            htmlFor="edit-conn-datadir"
          >
            <Input
              id="edit-conn-datadir"
              mono
              placeholder={cfg.dataDir}
              value={dataDir}
              onChange={(e) => setDataDir(e.target.value)}
            />
          </Field>
        )}

        <Field
          label="Workspace Group"
          hint="Group this connection belongs to."
          htmlFor="edit-conn-group"
        >
          <select
            id="edit-conn-group"
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value || null)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-fg focus:ring-1 focus:ring-ring focus:outline-none"
          >
            <option value="">Ungrouped</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium">Environment</span>
            <SegmentedControl<Env>
              ariaLabel="Environment"
              value={env}
              onChange={(v) => {
                setEnv(v);
                if (v === 'prod') setAllowWrites(false);
              }}
              options={[
                { value: 'dev', label: 'Dev' },
                { value: 'staging', label: 'Staging' },
                { value: 'prod', label: 'Prod' },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium">Allow writes</span>
              <span className="text-xs text-muted-foreground">
                {env === 'prod'
                  ? 'Production connections are always read-only.'
                  : 'Off = INSERT/UPDATE/DELETE are blocked.'}
              </span>
            </div>
            <Switch
              ariaLabel="Allow writes"
              checked={allowWrites && env !== 'prod'}
              disabled={env === 'prod'}
              onChange={setAllowWrites}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="ember" disabled={updateConn.isPending || !host || !port}>
            {updateConn.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
