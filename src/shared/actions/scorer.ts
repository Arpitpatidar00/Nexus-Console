import type { ActionItem } from './types';

/**
 * Checks if query is a subsequence of target in order.
 */
function isSubsequence(query: string, target: string): boolean {
  let qIdx = 0;
  for (let tIdx = 0; tIdx < target.length && qIdx < query.length; tIdx++) {
    if (query[qIdx] === target[tIdx]) {
      qIdx++;
    }
  }
  return qIdx === query.length;
}

/**
 * Calculate match score of a query against an action item.
 * Higher score = more relevant match. 0 = no match.
 */
export function scoreAction(action: ActionItem, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 0;

  const title = action.title.toLowerCase();
  let score = 0;

  // 1. Exact match on title
  if (title === query) {
    score += 1000;
  }
  // 2. Title starts with query
  else if (title.startsWith(query)) {
    score += 500 + Math.max(0, 100 - (title.length - query.length));
  }
  // 3. Word boundary starts with query
  else {
    const words = title.split(/[\s_\-:/]+/);
    const wordStarts = words.some((w) => w.startsWith(query));
    if (wordStarts) {
      score += 350;
    } else {
      // Check initials/acronym (e.g. "qs" for "Quick Scan")
      const acronym = words.map((w) => w[0]).join('');
      if (acronym.startsWith(query) || acronym === query) {
        score += 300;
      } else if (title.includes(query)) {
        score += 200;
      } else if (isSubsequence(query, title)) {
        score += 80;
      }
    }
  }

  // 4. Keywords matching
  if (action.keywords) {
    for (const kw of action.keywords) {
      const kwLower = kw.toLowerCase();
      if (kwLower === query) {
        score += 150;
      } else if (kwLower.startsWith(query)) {
        score += 100;
      } else if (kwLower.includes(query)) {
        score += 50;
      }
    }
  }

  // 5. Subtitle matching
  if (action.subtitle) {
    const subLower = action.subtitle.toLowerCase();
    if (subLower.includes(query)) {
      score += 40;
    }
  }

  return score;
}

/**
 * Filters and sorts actions by relevance to query.
 */
export function filterAndRankActions(actions: ActionItem[], query: string): ActionItem[] {
  const cleanQuery = query.trim();
  if (!cleanQuery) return actions;

  const scored = actions
    .map((action) => ({ action, score: scoreAction(action, cleanQuery) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.action);
}
