import { TriangleAlert } from 'lucide-react';

/** Things that didn't fail the read but limit what it shows (ACLs, an
 * unreachable broker, sizes unavailable). */
export const Warnings = ({ warnings }: { warnings: string[] }) =>
  warnings.length === 0 ? null : (
    <ul className="flex flex-col gap-1 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
      {warnings.map((w) => (
        <li key={w} className="flex items-start gap-2">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="break-words">{w}</span>
        </li>
      ))}
    </ul>
  );
