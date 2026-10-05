import { createHash, randomUUID } from 'node:crypto';
import { BaselineClaim, RepositoryBaseline, type RepositoryBaselineValue } from '../domain/repository-baseline-contracts.js';
import { repoRootHash } from '../domain/snapshot-contracts.js';
import type { GitSnapshotTools } from './git-snapshot.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const MAX_BASELINE_BYTES = 8_192;
const selected = (path: string) => /(?:^|\/)(?:package\.json|pnpm-workspace\.yaml|tsconfig[^/]*\.json|README\.md|AGENTS\.md|CONTRIBUTING\.md|Dockerfile|Makefile)$/.test(path)
  || /^docs\/architecture\.md$/.test(path) || /^\.github\/workflows\/[^/]+\.(?:yml|yaml)$/.test(path);
const guidance = (path: string) => /(?:^|\/)(?:AGENTS\.md|CONTRIBUTING\.md|README\.md)$/.test(path);
const framework = new Set(['react', 'next', 'vue', 'svelte', 'angular', 'fastify', 'express', 'vite', 'vitest', 'jest', 'typescript']);

/** Deterministic orientation from an admitted, filtered, scoped commit; never executes repository content. */
export async function buildRepositoryBaseline(snapshot: GitSnapshotTools, repoId: string, root: string, signal: AbortSignal): Promise<RepositoryBaselineValue> {
  const paths: string[] = [];
  let cursor = '';
  do {
    signal.throwIfAborted();
    const page = await snapshot.listFiles(repoId, cursor, 500, signal);
    paths.push(...page.files);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  } while (paths.length < 10_000);
  paths.sort();
  const claims: RepositoryBaselineValue['claims'] = [];
  const pathEvidence = (path: string) => ({ path, kind: 'eligible_path' as const, sha256: digest(`path:${path}`) });
  const blobEvidence = (path: string, sha256: string) => ({ path, kind: 'filtered_blob' as const, sha256 });
  const add = (category: RepositoryBaselineValue['claims'][number]['category'], classification: 'observed' | 'derived', value: string, evidence: RepositoryBaselineValue['claims'][number]['evidence']) => {
    if (claims.length < 40 && value.length <= 256 && !/[\r\n\0]/.test(value)) claims.push(BaselineClaim.parse({ category, classification, value, evidence }));
  };
  const supports: Array<[string, string]> = [];
  const manifestPaths = paths.filter(path => path.endsWith('package.json')).slice(0, 12);
  const selectedPaths = paths.filter(selected).slice(0, 24);
  const fileContent = new Map<string, { text: string; sha256: string; redacted: boolean }>();
  for (const path of selectedPaths) {
    signal.throwIfAborted();
    try {
      const file = await snapshot.readSearchText(repoId, path);
      supports.push([path, file.sha256]);
      fileContent.set(path, file);
    } catch { supports.push([path, 'unreadable']); }
  }
  const fingerprint = digest(JSON.stringify({ paths, supports }));

  const languageExt = new Map([['.ts', 'TypeScript'], ['.tsx', 'TypeScript'], ['.js', 'JavaScript'], ['.jsx', 'JavaScript'], ['.py', 'Python'], ['.rs', 'Rust'], ['.go', 'Go'], ['.java', 'Java'], ['.cs', 'C#'], ['.rb', 'Ruby']]);
  const languagePaths = new Map<string, string[]>();
  for (const path of paths) {
    const extension = /\.[^.\/]+$/.exec(path)?.[0] ?? '';
    const language = languageExt.get(extension);
    if (language) languagePaths.set(language, [...(languagePaths.get(language) ?? []), path]);
  }
  for (const [language, files] of [...languagePaths].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 5)) {
    add('language', 'observed', `${language}: ${files.length} eligible source paths`, [pathEvidence(files[0]!)]);
  }

  const rootManifest = fileContent.get('package.json');
  if (rootManifest && !rootManifest.redacted) add('identity', 'observed', 'Root package.json is present', [blobEvidence('package.json', rootManifest.sha256)]);
  const workspace = fileContent.get('pnpm-workspace.yaml');
  if (workspace && !workspace.redacted) add('identity', 'observed', 'pnpm workspace manifest is present', [blobEvidence('pnpm-workspace.yaml', workspace.sha256)]);
  for (const path of manifestPaths) {
    const file = fileContent.get(path);
    if (!file || file.redacted) { add('package', 'observed', `Package manifest: ${path}`, [pathEvidence(path)]); continue; }
    let data: Record<string, unknown>;
    try { const raw: unknown = JSON.parse(file.text); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue; data = raw as Record<string, unknown>; }
    catch { continue; }
    const name = typeof data['name'] === 'string' && data['name'].length <= 100 ? data['name'] : undefined;
    add('package', 'observed', `${path}${name ? `: ${name}` : ''}`, [blobEvidence(path, file.sha256)]);
    if (data['scripts'] && typeof data['scripts'] === 'object' && !Array.isArray(data['scripts'])) {
      for (const [name, command] of Object.entries(data['scripts']).sort(([a], [b]) => a.localeCompare(b)).slice(0, 12)) {
        if (typeof command === 'string' && name.length <= 64 && command.length <= 160 && !snapshot.secrets.filter(`${name}: ${command}`).redacted) {
          add('command', 'observed', `${name}: ${command}`, [blobEvidence(path, file.sha256)]);
        }
      }
    }
    for (const group of ['dependencies', 'devDependencies']) {
      const dependencies = data[group];
      if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
      for (const name of Object.keys(dependencies).filter(name => framework.has(name)).sort().slice(0, 8)) add('identity', 'observed', `Declared dependency: ${name}`, [blobEvidence(path, file.sha256)]);
    }
  }
  const modules = new Map<string, string>();
  for (const path of paths) {
    const match = /^(?:src|apps|packages)\/([^/]+)\//.exec(path);
    if (match) modules.set(`${path.split('/')[0]}/${match[1]}`, path);
  }
  for (const [module, path] of [...modules].sort(([a], [b]) => a.localeCompare(b)).slice(0, 10)) add('module', 'observed', module, [pathEvidence(path)]);
  for (const path of paths.filter(path => /(?:^|\/)(?:index|main|app|server)\.[cm]?[jt]sx?$/.test(path)).slice(0, 8)) add('entry_point', 'derived', `Likely entry point: ${path}`, [pathEvidence(path)]);
  for (const path of paths.filter(path => /(?:^|\/)(?:tests?|__tests__|specs?)\//.test(path)).slice(0, 6)) add('tests', 'observed', `Test/spec path: ${path}`, [pathEvidence(path)]);
  for (const path of paths.filter(guidance).slice(0, 8)) add('guidance', 'observed', `Guidance document: ${path}`, [pathEvidence(path)]);
  for (const path of paths.filter(path => /^docs\/architecture\.md$/.test(path)).slice(0, 2)) add('architecture', 'observed', `Architecture document: ${path}`, [pathEvidence(path)]);
  for (const path of paths.filter(path => /(?:^|\/)(?:tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|Dockerfile|Makefile)$/.test(path)).slice(0, 8)) add('configuration', 'observed', `Configuration: ${path}`, [pathEvidence(path)]);
  const unknowns = ['Runtime behavior and command safety were not verified.'];
  if (!paths.some(guidance)) unknowns.push('No repository guidance document was observed in this task scope.');
  else unknowns.push('Guidance consistency with current source was not verified.');
  if (!manifestPaths.length) unknowns.push('No package.json manifest was observed in this task scope.');
  const timestamp = new Date().toISOString();
  let baseline = RepositoryBaseline.parse({ schemaVersion: 1, id: randomUUID(), version: 1, status: 'current', repoId, repoRootHash: repoRootHash(root), baseCommit: snapshot.metadata.baseCommit, snapshotId: snapshot.metadata.snapshotId, ...(snapshot.metadata.scopeHash ? { scopeHash: snapshot.metadata.scopeHash } : {}), fingerprint, claims, unknowns, createdAt: timestamp });
  while (Buffer.byteLength(JSON.stringify(baseline)) > MAX_BASELINE_BYTES && baseline.claims.length) baseline = RepositoryBaseline.parse({ ...baseline, claims: baseline.claims.slice(0, -1) });
  if (Buffer.byteLength(JSON.stringify(baseline)) > MAX_BASELINE_BYTES) throw new Error('BASELINE_LIMIT');
  return baseline;
}
