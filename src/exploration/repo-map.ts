import type { GitSnapshotTools } from './git-snapshot.js';
import { ERROR_CODES } from '../constants/error-codes.js';

export type RepoMap = {
  schemaVersion: 1;
  snapshotId: string;
  scopeHash?: string;
  packages: Array<{ path: string; name?: string; scripts: string[] }>;
  files: string[];
  entryPoints: string[];
  configFiles: string[];
  testRoots: string[];
  importantFiles: string[];
  truncated: boolean;
};

const MAX_MAP_BYTES = 4096;
const MAX_PACKAGES = 12;
const MAX_PATHS = 24;
const MAX_SCRIPT_NAMES = 12;

const eligibleName = (name: unknown, max: number) => typeof name === 'string' && name.length <= max && !/[\x00-\x1f\x7f]/.test(name);
const push = (target: string[], value: string, max = MAX_PATHS) => { if (target.length < max) target.push(value); };

/** Navigation only: all paths and manifest content come from the admitted filtered commit. */
export async function buildRepoMap(snapshot: GitSnapshotTools, repoId: string, signal: AbortSignal): Promise<RepoMap> {
  const map: RepoMap = {
    schemaVersion: 1,
    snapshotId: snapshot.metadata.snapshotId,
    ...(snapshot.metadata.scopeHash ? { scopeHash: snapshot.metadata.scopeHash } : {}),
    packages: [], files: [], entryPoints: [], configFiles: [], testRoots: [], importantFiles: [], truncated: false,
  };
  let cursor = '';
  let scanned = 0;
  do {
    signal.throwIfAborted();
    const page = await snapshot.listFiles(repoId, cursor, 500, signal);
    for (const path of page.files) {
      scanned++;
      push(map.files, path);
      const leaf = path.split('/').at(-1)!;
      if (leaf === 'package.json' && map.packages.length < MAX_PACKAGES) {
        signal.throwIfAborted();
        const packagePath = path.slice(0, -leaf.length).replace(/\/$/, '') || '.';
        const item: RepoMap['packages'][number] = { path: packagePath, scripts: [] };
        try {
          const file = await snapshot.readSearchText(repoId, path);
          if (!file.redacted && Buffer.byteLength(file.text) <= 64_000) {
            const parsed: unknown = JSON.parse(file.text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              const data = parsed as Record<string, unknown>;
              if (eligibleName(data['name'], 128)) item.name = data['name'] as string;
              if (data['scripts'] && typeof data['scripts'] === 'object' && !Array.isArray(data['scripts'])) {
                item.scripts = Object.keys(data['scripts']).filter(name => eligibleName(name, 64)).sort().slice(0, MAX_SCRIPT_NAMES);
              }
            }
          }
        } catch (error) {
          if (!(error instanceof SyntaxError) && !(error instanceof Error && (error.message === ERROR_CODES.BINARY_FILE || error.message === ERROR_CODES.INVALID_UTF8))) throw error;
          // An unreadable manifest contributes only its eligible path. Missing Git objects fail closed.
        }
        map.packages.push(item);
      }
      if (/^(?:src\/)?(?:index|main|app|server)\.[cm]?[jt]sx?$/.test(path) || /\/(?:index|main|app|server)\.[cm]?[jt]sx?$/.test(path)) push(map.entryPoints, path);
      if (/^(?:tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s|pnpm-workspace\.yaml)$/.test(leaf)) push(map.configFiles, path);
      if (/(?:^|\/)(?:tests?|__tests__|specs?)\//.test(path)) push(map.testRoots, path.split('/').slice(0, -1).join('/'));
      if (/(?:^|\/)(?:README\.md|AGENTS\.md|Dockerfile|Makefile)$/.test(path)) push(map.importantFiles, path);
    }
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  } while (scanned < 10_000);
  for (const key of ['entryPoints', 'configFiles', 'testRoots', 'importantFiles'] as const) map[key] = [...new Set(map[key])];
  map.truncated = scanned < snapshot.metadata.eligibleFiles ||
    map.packages.length >= MAX_PACKAGES ||
    [map.files, map.entryPoints, map.configFiles, map.testRoots, map.importantFiles].some(items => items.length >= MAX_PATHS);
  const trimOrder = [map.testRoots, map.files, map.importantFiles, map.configFiles, map.entryPoints];
  while (Buffer.byteLength(JSON.stringify(map)) > MAX_MAP_BYTES) {
    const target = trimOrder.find(items => items.length);
    if (target) target.pop();
    else if (map.packages.length) map.packages.pop();
    else break;
    map.truncated = true;
  }
  return map;
}
