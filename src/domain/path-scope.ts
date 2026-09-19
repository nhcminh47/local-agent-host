import { createHash } from 'node:crypto';
import { z } from 'zod';

// Deliberately small grammar: exact Git paths, directory/**, or **.
const Pattern = z.string().min(1).max(512).refine(value => {
  if (value === '**') return true;
  const path = value.endsWith('/**') ? value.slice(0, -3) : value;
  return !/[\\:*?\[\]{}\x00-\x1f\x7f]/.test(path)
    && path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');
}, 'Use an exact repo-relative path, directory/**, or **');
const Patterns = z.array(Pattern).max(32).transform(values => [...new Set(values)].sort());
export const PathScope = z.object({ allow: Patterns.refine(values => values.length > 0), deny: Patterns.default([]) }).strict();
export type PathScopeValue = z.infer<typeof PathScope>;
export function scopeHash(scope: PathScopeValue) {
  return createHash('sha256').update(JSON.stringify(PathScope.parse(scope))).digest('hex');
}
export function scopedSnapshotId(commit: string, hash?: string) {
  return createHash('sha256').update(hash ? `${commit}\n${hash}` : commit).digest('hex');
}
export function inScope(path: string, scope?: PathScopeValue) {
  if (!scope) return true;
  const matches = (pattern: string) => pattern === '**' || (pattern.endsWith('/**') ? path.startsWith(pattern.slice(0, -2)) : path === pattern);
  return scope.allow.some(matches) && !scope.deny.some(matches);
}
