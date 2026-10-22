// `brew services start` succeeds even when the daemon dies a second later
// (mysqld_safe exits cleanly → brew reports `stopped`, not `error`). Remember
// recent starts so a card that is stopped right after one can say "didn't
// start — see why" instead of silently looking like nothing happened.
const WINDOW_MS = 3 * 60_000;
const attempts = new Map<string, number>();

export const markStartAttempt = (formula: string): void => {
  attempts.set(formula, Date.now());
};

export const clearStartAttempt = (formula: string): void => {
  attempts.delete(formula);
};

export function startedRecently(formula: string): boolean {
  const t = attempts.get(formula);
  if (t === undefined) return false;
  if (Date.now() - t > WINDOW_MS) {
    attempts.delete(formula);
    return false;
  }
  return true;
}
