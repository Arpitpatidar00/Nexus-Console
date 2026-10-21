#!/usr/bin/env node
// CHANGELOG.md from git history (PLAN G.3). Conventional-commit subjects,
// grouped by release tag (v*); commits after the last tag are "Unreleased",
// or `--next <version>` names that section (used by scripts/version.mjs).
// Usage: node scripts/changelog.mjs [--next 0.2.0]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const nextIdx = process.argv.indexOf('--next');
const next = nextIdx > 0 ? process.argv[nextIdx + 1] : null;

const SECTIONS = [
  ['feat', 'Added'],
  ['fix', 'Fixed'],
  ['perf', 'Performance'],
  ['security', 'Security'],
  ['refactor', 'Changed'],
  ['docs', 'Docs'],
];

function commits(range) {
  const out = git('log', '--no-merges', '--pretty=format:%s', ...(range ? [range] : []));
  return out ? out.split('\n') : [];
}

function section(title, date, subjects) {
  const buckets = new Map(SECTIONS.map(([, label]) => [label, []]));
  buckets.set('Other', []);
  for (const s of subjects) {
    const m = s.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
    const label = (m && SECTIONS.find(([t]) => t === m[1])?.[1]) ?? 'Other';
    if (m && ['chore', 'ci', 'test', 'style', 'build'].includes(m[1])) continue;
    const scope = m?.[2] ? `**${m[2]}:** ` : '';
    buckets.get(label).push(`- ${scope}${m ? m[4] : s}${m?.[3] ? ' (breaking)' : ''}`);
  }
  const body = [...buckets]
    .filter(([, items]) => items.length)
    .map(([label, items]) => `### ${label}\n\n${items.join('\n')}`)
    .join('\n\n');
  return `## ${title}${date ? ` — ${date}` : ''}\n\n${body || '_No user-facing changes._'}\n`;
}

const tags = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').filter(Boolean);
// Local calendar date (sv locale formats as YYYY-MM-DD), not UTC.
const today = new Date().toLocaleDateString('sv');
const parts = [];

const unreleased = commits(tags[0] ? `${tags[0]}..HEAD` : undefined);
if (unreleased.length) {
  parts.push(section(next ? next : 'Unreleased', next ? today : null, unreleased));
}
tags.forEach((tag, i) => {
  const range = tags[i + 1] ? `${tags[i + 1]}..${tag}` : tag;
  const date = git('log', '-1', '--format=%as', tag);
  parts.push(section(tag.replace(/^v/, ''), date, commits(range)));
});

writeFileSync(
  'CHANGELOG.md',
  `# Changelog\n\nGenerated from commit history by \`npm run changelog\` — do not edit by hand.\n\n${parts.join('\n')}`,
);
console.log(`CHANGELOG.md: ${parts.length} section(s)`);
