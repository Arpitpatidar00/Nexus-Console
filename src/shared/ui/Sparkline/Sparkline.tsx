import { sparkPoints } from './sparkPoints';

const W = 72;
const H = 18;

/** Recent trend, 0–100. Decorative: the number next to it carries the value. */
export const Sparkline = ({ values }: { values: (number | null)[] }) => {
  const points = sparkPoints(values, W, H);
  if (!points) return null;
  return (
    <svg
      aria-hidden
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0 overflow-visible text-fg-subtle"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};
