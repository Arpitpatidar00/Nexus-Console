import { CircleCheck } from 'lucide-react';
import { EmptyState } from '@/shared/ui/EmptyState';
// Deep import: the doctor barrel would pull DoctorPage into this chunk.
import { FindingCard } from '@/features/doctor/components/FindingCard';
import type { DoctorFinding } from '@/features/doctor/api/doctor.schema';
import type { HostFinding, HostSnapshot } from '@/features/remote/api/remote.schema';

/** Same visual language as Doctor: the card is reused as-is. Server findings
 * never carry an automated fix; guides are commands for the user to run. */
const asDoctor = (f: HostFinding): DoctorFinding => ({
  probeId: f.id,
  scope: 'system',
  severity: f.severity,
  tag: f.tag,
  summary: f.summary,
  explain: f.explain,
  guide: f.guide,
  fix: null,
});

export const IssuesPanel = ({ snapshot: s }: { snapshot: HostSnapshot }) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    {s.findings.length === 0 ? (
      <div className="h-56">
        <EmptyState
          icon={<CircleCheck className="h-8 w-8" />}
          title="No issues"
          description="Nothing in the checks Nexus runs needs attention."
        />
      </div>
    ) : (
      <div>
        {s.findings.map((f) => (
          <FindingCard key={`${f.id}:${f.target ?? ''}`} finding={asDoctor(f)} />
        ))}
      </div>
    )}
    {s.recentErrors.length > 0 && (
      <section className="border-t border-border">
        <h3 className="px-5 pt-3 pb-1.5 text-xs font-medium text-fg-subtle">
          Journal errors in the last hour ({s.recentErrors.length})
        </h3>
        <pre className="mx-5 mb-4 max-h-64 overflow-auto rounded-lg border border-border bg-canvas p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-muted">
          {s.recentErrors.join('\n')}
        </pre>
      </section>
    )}
  </div>
);
