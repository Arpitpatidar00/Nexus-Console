import { useEffect, useState } from 'react';
import {
  Bot,
  Code,
  Key,
  Binary,
  Clock,
  Fingerprint,
  Regex,
  Calendar,
  Hash,
  Palette,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { AiExplainModal } from '@/features/ai';
import {
  formatJson,
  minifyJson,
  validateJson,
  decodeJwt,
  encodeBase64,
  decodeBase64,
  encodeUrl,
  decodeUrl,
  timestampToDate,
  dateToTimestamp,
  generateUuidV4,
  generateUuidV7,
  parseUuid,
  testRegex,
  explainCron,
  computeMd5,
  computeSha1,
  computeSha256,
  hexToRgb,
  rgbToHsl,
} from '../utils/converters';

type ToolCategory =
  'json' | 'jwt' | 'base64' | 'timestamp' | 'uuid' | 'regex' | 'cron' | 'hash' | 'color';

export const ToolboxPage = () => {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolCategory>('json');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. JSON State
  const [jsonInput, setJsonInput] = useState(
    '{\n  "message": "Hello Stackroost",\n  "features": ["toolbox", "domains", "secrets"]\n}',
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonValid, setJsonValid] = useState(false);

  // 2. JWT State
  const [jwtInput, setJwtInput] = useState(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsIm5hbWUiOiJBcnBpdCIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxODAwMDAwMDAwfQ.dummy_signature',
  );

  // 3. Base64/URL State
  const [b64Input, setB64Input] = useState('Stackroost Local Developer Platform 🚀');
  const [b64Output, setB64Output] = useState('');

  // 4. Timestamp State
  const [tsInput, setTsInput] = useState(() => Math.floor(Date.now() / 1000).toString());
  const [dateInput, setDateInput] = useState(() => new Date().toISOString());

  // 5. UUID State
  const [uuidOutput, setUuidOutput] = useState('');
  const [uuidInspectInput, setUuidInspectInput] = useState('');

  // 6. Regex State
  const [regexPattern, setRegexPattern] = useState(
    '([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})',
  );
  const [regexFlags, setRegexFlags] = useState('g');
  const [regexText, setRegexText] = useState(
    'Reach out to dev@stackroost.app or team@example.org for support.',
  );

  // 7. Cron State
  const [cronInput, setCronInput] = useState('*/15 0 * * 1-5');

  // 8. Hash State
  const [hashInput, setHashInput] = useState('hello world');
  const [sha1Output, setSha1Output] = useState('');
  const [sha256Output, setSha256Output] = useState('');
  // SubtleCrypto is async — compute from the input itself (initial value
  // included; SHA-1/256 used to show "…" until the first keystroke), and drop
  // results for input that has since changed.
  useEffect(() => {
    let live = true;
    void Promise.all([computeSha1(hashInput), computeSha256(hashInput)]).then(([a, b]) => {
      if (!live) return;
      setSha1Output(a);
      setSha256Output(b);
    });
    return () => {
      live = false;
    };
  }, [hashInput]);

  // 9. Color State
  const [hexInput, setHexInput] = useState('#0ea5e9');

  const tools: { id: ToolCategory; label: string; icon: typeof Code }[] = [
    { id: 'json', label: 'JSON Formatter', icon: Code },
    { id: 'jwt', label: 'JWT Decoder', icon: Key },
    { id: 'base64', label: 'Base64 & URL', icon: Binary },
    { id: 'timestamp', label: 'Timestamp', icon: Clock },
    { id: 'uuid', label: 'UUID v4/v7', icon: Fingerprint },
    { id: 'regex', label: 'Regex Tester', icon: Regex },
    { id: 'cron', label: 'Cron Explainer', icon: Calendar },
    { id: 'hash', label: 'Hashes', icon: Hash },
    { id: 'color', label: 'Color Converter', icon: Palette },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="mb-5 flex shrink-0 items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg">Dev Toolbox</h1>
          <p className="text-xs text-fg-muted">
            100% offline, privacy-guaranteed developer utilities. Zero cloud calls, zero
            persistence.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAiModalOpen(true)}
          className="flex items-center gap-1.5 text-xs"
        >
          <Bot className="h-3.5 w-3.5 text-info" />
          Explain with Local AI
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-6 overflow-hidden">
        {/* Left Nav Pills */}
        <div className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto pr-2">
          {tools.map((t) => {
            const Icon = t.icon;
            const active = activeTool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTool(t.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'bg-ember-soft font-semibold text-ember-text shadow-xs'
                    : 'text-fg-muted hover:bg-list hover:text-fg'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Tool Canvas */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-border bg-paper p-5 shadow-xs">
          {/* JSON Tool */}
          {activeTool === 'json' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg">JSON Input / Output</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const res = formatJson(jsonInput);
                      if (res.ok && res.result) {
                        setJsonInput(res.result);
                        setJsonError(null);
                      } else {
                        setJsonError(res.error || 'Formatting error');
                      }
                    }}
                  >
                    Beautify (2 spaces)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const res = minifyJson(jsonInput);
                      if (res.ok && res.result) {
                        setJsonInput(res.result);
                        setJsonError(null);
                      } else {
                        setJsonError(res.error || 'Minify error');
                      }
                    }}
                  >
                    Minify
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const val = validateJson(jsonInput);
                      setJsonValid(val.valid);
                      if (val.valid) {
                        setJsonError(null);
                      } else {
                        setJsonError(val.error || 'Invalid JSON');
                      }
                    }}
                  >
                    Validate
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => copyToClipboard('json', jsonInput)}
                  >
                    {copiedKey === 'json' ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {jsonError ? (
                <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  ⚠️ {jsonError}
                </div>
              ) : (
                jsonValid && (
                  <div className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
                    ✓ Valid JSON
                  </div>
                )
              )}

              <textarea
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
                  setJsonValid(false);
                  setJsonError(null);
                }}
                rows={16}
                className="w-full rounded-lg border border-border bg-muted p-3 font-mono text-xs text-fg focus:border-ember focus:outline-none"
                placeholder="Paste JSON here..."
              />
            </div>
          )}

          {/* JWT Tool */}
          {activeTool === 'jwt' && (
            <div className="flex flex-col gap-4">
              <span className="text-xs font-semibold text-fg">Encoded JWT Token</span>
              <textarea
                value={jwtInput}
                onChange={(e) => setJwtInput(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border bg-muted p-2.5 font-mono text-xs text-fg focus:border-ember focus:outline-none"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
              />

              {(() => {
                const dec = decodeJwt(jwtInput);
                if (!dec.ok) {
                  return (
                    <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                      ⚠️ {dec.error}
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-fg">Header (Decoded)</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard('jwt_header', JSON.stringify(dec.header, null, 2))
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <pre className="max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-xs text-fg">
                        {JSON.stringify(dec.header, null, 2)}
                      </pre>
                    </div>

                    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-fg">Payload (Claims)</span>
                          {dec.isExpired !== undefined && (
                            <Badge variant={dec.isExpired ? 'danger' : 'success'}>
                              {dec.isExpired ? 'Expired' : 'Valid Exp'}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard('jwt_payload', JSON.stringify(dec.payload, null, 2))
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <pre className="max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-xs text-fg">
                        {JSON.stringify(dec.payload, null, 2)}
                      </pre>
                      {dec.expiresAtFormatted && (
                        <p className="text-[11px] text-fg-muted">
                          Expires: {dec.expiresAtFormatted}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Base64 & URL */}
          {activeTool === 'base64' && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs font-semibold text-fg">Plaintext Input</span>
                <textarea
                  value={b64Input}
                  onChange={(e) => setB64Input(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-muted p-2.5 font-mono text-xs text-fg"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setB64Output(encodeBase64(b64Input))}
                >
                  Base64 Encode
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setB64Output(decodeBase64(b64Input))}
                >
                  Base64 Decode
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setB64Output(encodeUrl(b64Input))}
                >
                  URL Encode
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setB64Output(decodeUrl(b64Input))}
                >
                  URL Decode
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-fg">Result</span>
                  {b64Output && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard('b64', b64Output)}
                    >
                      {copiedKey === 'b64' ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
                <textarea
                  readOnly
                  value={b64Output}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-border bg-muted p-2.5 font-mono text-xs text-fg"
                />
              </div>
            </div>
          )}

          {/* Timestamp */}
          {activeTool === 'timestamp' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-3.5">
                  <span className="text-xs font-semibold text-fg">
                    Epoch Seconds / Millis to Date
                  </span>
                  <input
                    type="text"
                    value={tsInput}
                    onChange={(e) => setTsInput(e.target.value)}
                    className="mt-2 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                  />
                  {(() => {
                    const res = timestampToDate(tsInput, tsInput.length > 10 ? 'ms' : 's');
                    return (
                      <div className="mt-3 flex flex-col gap-1 text-xs">
                        <span className="text-fg-muted">
                          ISO 8601: <strong className="font-mono text-fg">{res.iso}</strong>
                        </span>
                        <span className="text-fg-muted">
                          Local Time: <strong className="font-mono text-fg">{res.local}</strong>
                        </span>
                        <span className="text-fg-muted">
                          UTC: <strong className="font-mono text-fg">{res.utc}</strong>
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="rounded-lg border border-border p-3.5">
                  <span className="text-xs font-semibold text-fg">Date String to Epoch</span>
                  <input
                    type="text"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="mt-2 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                  />
                  {(() => {
                    const res = dateToTimestamp(dateInput);
                    return (
                      <div className="mt-3 flex flex-col gap-1 text-xs">
                        <span className="text-fg-muted">
                          Seconds: <strong className="font-mono text-fg">{res.seconds}</strong>
                        </span>
                        <span className="text-fg-muted">
                          Milliseconds: <strong className="font-mono text-fg">{res.millis}</strong>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* UUID */}
          {activeTool === 'uuid' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => setUuidOutput(generateUuidV4())}>
                  Generate UUID v4 (Random)
                </Button>
                <Button variant="outline" size="sm" onClick={() => setUuidOutput(generateUuidV7())}>
                  Generate UUID v7 (Time-ordered)
                </Button>
              </div>

              {uuidOutput && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3">
                  <span className="font-mono text-sm text-fg">{uuidOutput}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard('uuid', uuidOutput)}
                  >
                    {copiedKey === 'uuid' ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}

              <div className="mt-2 rounded-lg border border-border p-3.5">
                <span className="text-xs font-semibold text-fg">Inspect &amp; Validate UUID</span>
                <input
                  type="text"
                  placeholder="Paste UUID here..."
                  value={uuidInspectInput}
                  onChange={(e) => setUuidInspectInput(e.target.value)}
                  className="mt-2 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                />
                {uuidInspectInput &&
                  (() => {
                    const p = parseUuid(uuidInspectInput);
                    if (!p.valid) {
                      return <p className="mt-2 text-xs text-danger">Invalid UUID syntax.</p>;
                    }
                    return (
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <Badge variant="neutral">Version {p.version}</Badge>
                        <span className="text-fg-muted">{p.variant}</span>
                        {p.timestamp && <span className="text-fg-muted">Time: {p.timestamp}</span>}
                      </div>
                    );
                  })()}
              </div>
            </div>
          )}

          {/* Regex Tester */}
          {activeTool === 'regex' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-3">
                  <span className="text-xs font-semibold text-fg">Pattern</span>
                  <input
                    type="text"
                    value={regexPattern}
                    onChange={(e) => setRegexPattern(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                  />
                </div>
                <div>
                  <span className="text-xs font-semibold text-fg">Flags</span>
                  <input
                    type="text"
                    value={regexFlags}
                    onChange={(e) => setRegexFlags(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                  />
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-fg">Test Text</span>
                <textarea
                  value={regexText}
                  onChange={(e) => setRegexText(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded border border-border bg-muted p-2.5 font-mono text-xs text-fg"
                />
              </div>

              {(() => {
                const res = testRegex(regexPattern, regexFlags, regexText);
                if (res.error) {
                  return <p className="text-xs text-danger">⚠️ {res.error}</p>;
                }
                return (
                  <div className="rounded-lg border border-border p-3">
                    <span className="text-xs font-semibold text-fg">Matches ({res.count})</span>
                    <div className="mt-2 max-h-48 divide-y divide-border overflow-y-auto">
                      {res.matchesList.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1.5 text-xs">
                          <span className="font-mono text-ember-text">
                            #{idx + 1}: {m.match}
                          </span>
                          <span className="text-fg-muted">Index {m.index}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Cron Explainer */}
          {activeTool === 'cron' && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs font-semibold text-fg">Cron Expression</span>
                <input
                  type="text"
                  value={cronInput}
                  onChange={(e) => setCronInput(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                />
              </div>

              {(() => {
                const expl = explainCron(cronInput);
                if (expl.error) {
                  return <p className="text-xs text-danger">⚠️ {expl.error}</p>;
                }
                return (
                  <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                    <span className="text-sm font-medium text-fg">{expl.summary}</span>
                    <div className="mt-2">
                      <span className="text-xs font-semibold text-fg-muted">
                        Next 5 scheduled iterations:
                      </span>
                      <ul className="mt-1.5 list-inside list-disc text-xs text-fg">
                        {expl.nextRuns.map((r, i) => (
                          <li key={i} className="font-mono text-fg">
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Hashes */}
          {activeTool === 'hash' && (
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-xs font-semibold text-fg">Input String</span>
                <input
                  type="text"
                  value={hashInput}
                  onChange={(e) => {
                    setHashInput(e.target.value);
                  }}
                  className="mt-1 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                />
              </div>

              <div className="flex flex-col gap-3">
                {[
                  { label: 'MD5', value: computeMd5(hashInput) },
                  { label: 'SHA-1', value: sha1Output },
                  { label: 'SHA-256', value: sha256Output },
                ].map((h) => (
                  <div key={h.label} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-fg-muted">{h.label}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(h.label, h.value)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="mt-1 font-mono text-xs break-all text-fg">{h.value || '...'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Color Converter */}
          {activeTool === 'color' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div
                  className="h-12 w-12 shrink-0 rounded-lg border border-border shadow-xs"
                  style={{ backgroundColor: hexInput }}
                />
                <div className="flex-1">
                  <span className="text-xs font-semibold text-fg">HEX Color Code</span>
                  <input
                    type="text"
                    value={hexInput}
                    onChange={(e) => setHexInput(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-muted px-2.5 py-1.5 font-mono text-xs text-fg"
                  />
                </div>
              </div>

              {(() => {
                const rgb = hexToRgb(hexInput);
                if (!rgb) {
                  return <p className="text-xs text-danger">Invalid HEX color.</p>;
                }
                const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border border-border p-3">
                      <span className="text-xs font-semibold text-fg-muted">RGB</span>
                      <p className="mt-1 font-mono text-xs text-fg">
                        rgb({rgb.r}, {rgb.g}, {rgb.b})
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <span className="text-xs font-semibold text-fg-muted">HSL</span>
                      <p className="mt-1 font-mono text-xs text-fg">
                        hsl({hsl.h}, {hsl.s}%, {hsl.l}%)
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
      <AiExplainModal open={aiModalOpen} onOpenChange={setAiModalOpen} />
    </div>
  );
};
