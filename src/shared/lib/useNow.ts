import { useEffect, useState } from 'react';

/** The current time in ms, read once on mount — a render-pure stand-in for
 * `Date.now()` (React Compiler). Pass `tickMs` to keep it fresh while shown. */
export function useNow(tickMs?: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!tickMs) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
