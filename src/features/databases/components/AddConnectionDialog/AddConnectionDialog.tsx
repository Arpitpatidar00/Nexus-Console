import { useState } from 'react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Switch } from '@/shared/ui/Switch';
import { useAddDbConnection } from '@/features/databases/api/useDatabases';
import { parseConnectionUrl } from '@/features/databases/utils/connectionUrl';
import { ENGINES, type Engine } from './AddConnectionDialog.config';

type Env = 'dev' | 'staging' | 'prod';

interface AddConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddConnectionDialog = ({ open, onOpenChange }: AddConnectionDialogProps) => {
  const addConn = useAddDbConnection();
  const [engine, setEngine] = useState<Engine>('postgres');
  const [name, setName] = useState('');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(String(ENGINES.postgres.port));
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [dataDir, setDataDir] = useState('');
  const [env, setEnv] = useState<Env>('dev');
  const [allowWrites, setAllowWrites] = useState(false);
  const [url, setUrl] = useState('');
  const [urlNote, setUrlNote] = useState<{ ok: boolean; text: string } | null>(null);

  const cfg = ENGINES[engine];

  // Switching engine resets the engine-shaped fields — a MySQL connection
  // silently saved on Postgres' 5432 was the old form's bug.
  const pickEngine = (e: Engine) => {
    setEngine(e);
    setPort(String(ENGINES[e].port));
    setUser('');
    setDatabase('');
    setDataDir('');
  };

  // A pasted DATABASE_URL fills every field; only the fields are saved (the
  // password goes to the Keychain like a typed one).
  const fillFromUrl = (text: string) => {
    setUrl(text);
    if (!text.trim()) return setUrlNote(null);
    const p = parseConnectionUrl(text);
    if ('error' in p) return setUrlNote({ ok: false, text: p.error });
    setEngine(p.engine);
    setPort(String(p.port));
    setHost(p.host);
    setUser(p.user);
    setPassword(p.password);
    setDatabase(p.database);
    setDataDir('');
    if (!name.trim()) setName(p.database ? `${p.database} · ${p.host.split('.')[0]}` : p.host);
    const extra = Object.entries(p.params)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    setUrlNote({
      ok: true,
      text: `Filled in below${extra ? ` (${extra})` : ''}. Check the environment before saving.`,
    });
  };

  const reset = () => {
    setUrl('');
    setUrlNote(null);
    pickEngine('postgres');
    setName('');
    setHost('127.0.0.1');
    setPassword('');
    setEnv('dev');
    setAllowWrites(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addConn.mutate(
      {
        name: name.trim() || `${cfg.label} · ${host}:${port}`,
        driver: engine,
        host: host.trim(),
        port: Number(port),
        user: cfg.user ? user.trim() || cfg.user.default || null : null,
        password: password || undefined,
        database: database.trim() || null,
        allowWrites: allowWrites && env !== 'prod',
        env,
        dataDir: cfg.dataDir ? dataDir.trim() || null : null,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add database connection"
      description="Passwords are stored in the macOS Keychain, never in a file."
      size="md"
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Paste a connection URL"
          hint={urlNote?.text ?? 'Optional — e.g. a DATABASE_URL. Fills the fields below.'}
          htmlFor="conn-url"
        >
          <Input
            id="conn-url"
            mono
            autoComplete="off"
            spellCheck={false}
            placeholder="postgresql://user:password@host:5432/db"
            value={url}
            onChange={(e) => fillFromUrl(e.target.value)}
            aria-invalid={urlNote?.ok === false || undefined}
          />
        </Field>
        <SegmentedControl<Engine>
          ariaLabel="Database engine"
          value={engine}
          onChange={pickEngine}
          options={(Object.keys(ENGINES) as Engine[]).map((k) => ({
            value: k,
            label: ENGINES[k].label,
          }))}
        />

        <Field label="Name" hint="Optional — defaults to engine and address." htmlFor="conn-name">
          <Input
            id="conn-name"
            placeholder={`e.g. Local ${cfg.label}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Host" htmlFor="conn-host">
            <Input
              id="conn-host"
              required
              mono
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </Field>
          <Field label="Port" htmlFor="conn-port">
            <Input
              id="conn-port"
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
            <Field label="User" htmlFor="conn-user">
              <Input
                id="conn-user"
                autoComplete="off"
                placeholder={cfg.user.placeholder}
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </Field>
          )}
          <Field label="Password" hint="Optional." htmlFor="conn-password">
            <Input
              id="conn-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {cfg.database && (
            <Field label={cfg.database.label} hint={cfg.database.hint} htmlFor="conn-db">
              <Input
                id="conn-db"
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
            htmlFor="conn-datadir"
          >
            <Input
              id="conn-datadir"
              mono
              placeholder={cfg.dataDir}
              value={dataDir}
              onChange={(e) => setDataDir(e.target.value)}
            />
          </Field>
        )}

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
          <Button type="submit" variant="ember" disabled={addConn.isPending || !host || !port}>
            {addConn.isPending ? 'Saving…' : 'Save connection'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
