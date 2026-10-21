import { useId, type InputHTMLAttributes } from 'react';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { ENVS, type HostEnv } from '@/features/remote/api/remote.schema';

export const inputCls =
  'h-9 w-full rounded-md border border-border bg-paper px-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-ember';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const TextField = ({ label, hint, ...input }: TextFieldProps) => {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-fg-muted">
        {label}
      </label>
      <input id={id} autoComplete="off" spellCheck={false} className={inputCls} {...input} />
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
};

const ENV_LABEL: Record<HostEnv, string> = {
  dev: 'Dev',
  staging: 'Staging',
  prod: 'Prod',
  other: 'Other',
};
export const ENV_OPTIONS = ENVS.map((value) => ({ value, label: ENV_LABEL[value] }));

export const EnvField = ({
  value,
  onChange,
}: {
  value: HostEnv;
  onChange: (v: HostEnv) => void;
}) => (
  <div className="space-y-1">
    <span className="block text-xs font-medium text-fg-muted">Environment</span>
    <SegmentedControl
      ariaLabel="Environment"
      value={value}
      options={ENV_OPTIONS}
      onChange={onChange}
    />
    {value === 'prod' && (
      <p className="text-xs text-fg-subtle">Every change on a prod server asks you twice.</p>
    )}
  </div>
);

/** Project input with the projects already in use as suggestions. */
export const ProjectField = ({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) => {
  const listId = useId();
  return (
    <>
      <TextField
        label="Project"
        placeholder="Ungrouped"
        value={value}
        maxLength={64}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((p) => (
          <option key={p} value={p} aria-label={p} />
        ))}
      </datalist>
    </>
  );
};
