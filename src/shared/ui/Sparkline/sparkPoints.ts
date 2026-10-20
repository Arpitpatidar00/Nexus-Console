/** Polyline points for a 0–100 series in a `w`×`h` box; nulls are skipped. */
export function sparkPoints(values: (number | null)[], w: number, h: number): string {
  if (values.length < 2) return '';
  const step = w / (values.length - 1);
  return values
    .map((v, i) =>
      v == null
        ? null
        : `${(i * step).toFixed(1)},${(h - (Math.min(100, Math.max(0, v)) / 100) * h).toFixed(1)}`,
    )
    .filter(Boolean)
    .join(' ');
}
