import { useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Dialog } from '@/shared/ui/Dialog';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Field';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { Spinner } from '@/shared/ui/Spinner';
import { useSaveKafkaCluster, useTestKafkaConnection } from '../../api/useKafka';
import type { ClusterInput, KafkaCluster, Security } from '../../api/kafka.schema';
import { plaintextPasswordRisk } from '../../utils/format';

type Env = 'local' | 'dev' | 'staging' | 'prod';
type Transport = 'plaintext' | 'tls';

const MECHANISMS = ['PLAIN', 'SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;

interface ClusterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this cluster; `null` adds a new one. */
  cluster: KafkaCluster | null;
  onSaved?: (cluster: KafkaCluster) => void;
}

function security(transport: Transport, sasl: boolean): Security {
  if (transport === 'tls') return sasl ? 'saslSsl' : 'ssl';
  return sasl ? 'saslPlaintext' : 'plaintext';
}

/** The form, keyed by the cluster it edits so it starts fresh each time. */
const ClusterForm = ({
  cluster,
  onDone,
  onSaved,
}: {
  cluster: KafkaCluster | null;
  onDone: () => void;
  onSaved?: (cluster: KafkaCluster) => void;
}) => {
  const save = useSaveKafkaCluster();
  const test = useTestKafkaConnection();
  const editing = cluster !== null;

  const [name, setName] = useState(cluster?.name ?? '');
  const [bootstrap, setBootstrap] = useState(cluster?.bootstrap.join(', ') ?? 'localhost:9092');
  const [transport, setTransport] = useState<Transport>(
    cluster && (cluster.security === 'ssl' || cluster.security === 'saslSsl') ? 'tls' : 'plaintext',
  );
  const [sasl, setSasl] = useState(
    cluster?.security === 'saslPlaintext' || cluster?.security === 'saslSsl',
  );
  const [mechanism, setMechanism] = useState(cluster?.saslMechanism ?? 'SCRAM-SHA-512');
  const [username, setUsername] = useState(cluster?.username ?? '');
  // Empty while editing = keep the saved password.
  const [password, setPassword] = useState('');
  const [caCertPath, setCaCertPath] = useState(cluster?.caCertPath ?? '');
  const [env, setEnv] = useState<Env>((cluster?.env as Env | undefined) ?? 'local');

  const sec = security(transport, sasl);
  const input = (): ClusterInput => ({
    id: cluster?.id ?? null,
    name: name.trim() || bootstrap.split(',')[0]?.trim() || 'Kafka',
    bootstrap,
    security: sec,
    saslMechanism: sasl ? mechanism : null,
    username: sasl ? username.trim() : null,
    // Untouched while editing → keep; typed → replace; new cluster → as typed.
    password: sasl ? (editing && password === '' ? undefined : password) : undefined,
    caCertPath: transport === 'tls' ? caCertPath.trim() || null : null,
    env,
  });

  const result = test.data;
  const risky = sasl && plaintextPasswordRisk(sec, mechanism, bootstrap);
  const canSubmit = bootstrap.trim() !== '' && (!sasl || username.trim() !== '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(input(), {
      onSuccess: (saved) => {
        onSaved?.(saved);
        onDone();
      },
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Name" hint="Optional — defaults to the first server." htmlFor="kafka-name">
        <Input
          id="kafka-name"
          placeholder="e.g. Local Kafka"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <Field
        label="Bootstrap servers"
        hint="host:port, comma-separated. One reachable server is enough; Stackroost finds the rest."
        htmlFor="kafka-bootstrap"
      >
        <Input
          id="kafka-bootstrap"
          required
          mono
          autoComplete="off"
          spellCheck={false}
          placeholder="localhost:9092"
          value={bootstrap}
          onChange={(e) => {
            setBootstrap(e.target.value);
            test.reset();
          }}
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-medium">Encryption</span>
        <SegmentedControl<Transport>
          ariaLabel="Encryption"
          value={transport}
          onChange={(t) => {
            setTransport(t);
            test.reset();
          }}
          options={[
            { value: 'plaintext', label: 'None' },
            { value: 'tls', label: 'TLS' },
          ]}
        />
      </div>
      {transport === 'tls' && (
        <Field
          label="Extra CA certificate"
          hint="Optional — absolute path to a PEM file, for clusters signed by a private CA. Certificates your Mac trusts already work."
          htmlFor="kafka-ca"
        >
          <Input
            id="kafka-ca"
            mono
            spellCheck={false}
            placeholder="/Users/you/certs/ca.pem"
            value={caCertPath}
            onChange={(e) => setCaCertPath(e.target.value)}
          />
        </Field>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-medium">Authentication</span>
        <SegmentedControl<'none' | 'sasl'>
          ariaLabel="Authentication"
          value={sasl ? 'sasl' : 'none'}
          onChange={(v) => {
            setSasl(v === 'sasl');
            test.reset();
          }}
          options={[
            { value: 'none', label: 'None' },
            { value: 'sasl', label: 'SASL' },
          ]}
        />
      </div>
      {sasl && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Mechanism" htmlFor="kafka-mechanism">
            <Select
              id="kafka-mechanism"
              size="sm"
              value={mechanism}
              onChange={(e) => setMechanism(e.target.value)}
            >
              {MECHANISMS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Username" htmlFor="kafka-user">
            <Input
              id="kafka-user"
              size="sm"
              required
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field
            label="Password"
            hint={
              editing && cluster?.hasPassword ? 'Leave empty to keep the saved one.' : undefined
            }
            htmlFor="kafka-password"
          >
            <Input
              id="kafka-password"
              size="sm"
              type="password"
              autoComplete="new-password"
              placeholder={editing && cluster?.hasPassword ? '••••••••' : ''}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
      )}
      {risky && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          PLAIN without TLS sends this password unencrypted to a remote host. Prefer TLS or SCRAM.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-medium">Environment</span>
        <SegmentedControl<Env>
          ariaLabel="Environment"
          value={env}
          onChange={setEnv}
          options={[
            { value: 'local', label: 'Local' },
            { value: 'dev', label: 'Dev' },
            { value: 'staging', label: 'Staging' },
            { value: 'prod', label: 'Prod' },
          ]}
        />
      </div>

      <div aria-live="polite" className="min-h-0">
        {test.isPending && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" /> Connecting…
          </p>
        )}
        {result && !test.isPending && (
          <div
            className={
              result.ok
                ? 'rounded-lg bg-success-soft px-3 py-2 text-xs text-success'
                : 'rounded-lg bg-danger-soft px-3 py-2 text-xs text-destructive'
            }
          >
            <p className="flex items-start gap-2 font-medium">
              {result.ok ? (
                <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              ) : (
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              )}
              <span className="break-words">
                {result.ok
                  ? `Connected in ${result.latencyMs} ms — ${result.brokerCount} broker${result.brokerCount === 1 ? '' : 's'}, ${result.topicCount} topic${result.topicCount === 1 ? '' : 's'}`
                  : result.error}
              </span>
            </p>
            {result.warnings.map((w) => (
              <p key={w} className="mt-1 pl-5.5 text-warning">
                {w}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canSubmit || test.isPending}
          onClick={() => test.mutate(input())}
        >
          Test connection
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="ember" disabled={!canSubmit || save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add cluster'}
          </Button>
        </div>
      </div>
    </form>
  );
};

export const ClusterDialog = ({ open, onOpenChange, cluster, onSaved }: ClusterDialogProps) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title={cluster ? `Edit ${cluster.name}` : 'Add Kafka cluster'}
    description="Read-only: Stackroost never produces messages or commits offsets. SASL passwords are kept in an encrypted local vault."
    size="md"
  >
    {open && (
      <ClusterForm
        key={cluster?.id ?? 'new'}
        cluster={cluster}
        onDone={() => onOpenChange(false)}
        onSaved={onSaved}
      />
    )}
  </Dialog>
);
