import { useState } from 'react';
import { ChevronRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import type { KafkaMessage, Payload } from '../../api/kafka.schema';
import {
  FORMAT_LABEL,
  formatTimestamp,
  messageToJson,
  payloadPreview,
  prettyPayload,
} from '../../utils/format';

const copy = (text: string, what: string) => {
  void navigator.clipboard.writeText(text);
  toast.success(`Copied ${what}`);
};

const Body = ({ label, payload }: { label: string; payload: Payload | null }) => (
  <section className="flex min-w-0 flex-col gap-1.5">
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="font-medium text-fg">{label}</span>
      {payload ? (
        <>
          <Badge size="sm">{FORMAT_LABEL[payload.format]}</Badge>
          {payload.schemaId !== null && <span>schema id {payload.schemaId}</span>}
          <span>{formatBytes(payload.size)}</span>
          {payload.truncated && <span className="text-warning">showing the first 64 KB</span>}
          <button
            type="button"
            className="ml-auto inline-flex cursor-pointer items-center gap-1 hover:text-fg"
            onClick={() => copy(payload.text, label.toLowerCase())}
            title={payload.base64 ? 'Copies the bytes as base64' : undefined}
          >
            <Copy className="size-3" aria-hidden /> Copy
          </button>
        </>
      ) : (
        <span>{label === 'Value' ? 'null — a tombstone (delete marker)' : 'null'}</span>
      )}
    </div>
    {payload && (
      <pre className="max-h-80 overflow-auto rounded-md border border-hairline bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-fg">
        {prettyPayload(payload) || <span className="text-muted-foreground">(empty)</span>}
      </pre>
    )}
  </section>
);

export const MessageRow = ({ message: m }: { message: KafkaMessage }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-hairline last:border-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full cursor-pointer grid-cols-[1rem_3.5rem_6rem_10.5rem_minmax(5rem,12rem)_1fr] items-center gap-3 px-4 py-2 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronRight
          className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        <span className="font-mono text-muted-foreground tabular-nums">p{m.partition}</span>
        <span className="truncate font-mono tabular-nums" title={`offset ${m.offset}`}>
          {m.offset.toLocaleString('en-US')}
        </span>
        <span className="font-mono text-muted-foreground tabular-nums">
          {formatTimestamp(m.timestamp)}
        </span>
        <span
          className="truncate font-mono text-ember-text"
          title={m.key ? payloadPreview(m.key, 500) : 'null'}
        >
          {payloadPreview(m.key, 60)}
        </span>
        <span className={cn('truncate font-mono', !m.value && 'text-muted-foreground italic')}>
          {m.value ? payloadPreview(m.value) : 'null (tombstone)'}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 bg-muted/20 px-4 pt-1 pb-4 pl-11">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Partition <span className="font-mono text-fg">{m.partition}</span>
            </span>
            <span>
              Offset <span className="font-mono text-fg">{m.offset}</span>
            </span>
            <span>
              {m.timestampType === 'logAppend' ? 'Broker append time' : 'Producer time'}{' '}
              <span className="font-mono text-fg">
                {new Date(m.timestamp).toISOString()} ({m.timestamp})
              </span>
            </span>
            <span>{formatBytes(m.size)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              onClick={() => copy(JSON.stringify(messageToJson(m), null, 2), 'message as JSON')}
            >
              <Copy /> Copy message
            </Button>
          </div>
          <Body label="Value" payload={m.value} />
          <Body label="Key" payload={m.key} />
          {m.headers.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-fg">Headers ({m.headers.length})</span>
              <table className="w-full rounded-md border border-hairline text-[11px]">
                <tbody>
                  {m.headers.map((h, i) => (
                    <tr key={`${h.key}-${i}`} className="border-b border-hairline last:border-0">
                      <td className="w-1/4 px-2.5 py-1.5 align-top font-mono text-muted-foreground">
                        {h.key}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono break-all">
                        {h.value ? (
                          payloadPreview(h.value, 400)
                        ) : (
                          <span className="text-muted-foreground">null</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </li>
  );
};
