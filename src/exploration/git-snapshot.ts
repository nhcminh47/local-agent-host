import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { devNull } from 'node:os';
import { realpath } from 'node:fs/promises';
import { resolveExecutable } from './capabilities.js';
import { RepoRegistry } from './repo-registry.js';
import { ReadTools, isDeniedPath } from './read-tools.js';
import { SecretFilter } from './secret-filter.js';
import { PathScope, inScope, scopeHash, scopedSnapshotId, type PathScopeValue } from '../domain/path-scope.js';

type Entry = Readonly<{ oid: string; size: number }>;

async function git(executable: string, root: string, args: string[], maxBytes: number): Promise<Buffer> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path', 'systemroot', 'windir', 'temp', 'tmp'].includes(key.toLowerCase())));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : devNull, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' });
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(executable, ['--no-replace-objects', '--no-lazy-fetch', '-c', 'core.fsmonitor=false', '-C', root, ...args], { env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { reject(new Error('GIT_UNAVAILABLE')); return; }
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: string | undefined;
    const timeout = setTimeout(() => { failure = 'GIT_TIMEOUT'; child.kill(); }, 5000);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) { failure = 'SNAPSHOT_LIMIT'; child.kill(); }
      else chunks.push(chunk);
    });
    child.once('error', () => { failure = 'GIT_UNAVAILABLE'; });
    child.once('close', code => {
      clearTimeout(timeout);
      if (failure || code !== 0) reject(new Error(failure ?? 'GIT_OBJECT_UNAVAILABLE'));
      else resolve(Buffer.concat(chunks));
    });
  });
}

// No checkout, index write, hooks, textconv, filters, lazy fetch or ref mutation.
// Git objects are addressed by immutable ID. Missing/pruned objects fail closed.
export class GitSnapshotTools extends ReadTools {
  readonly metadata: Readonly<{ baseCommit: string; snapshotId: string; scopeHash?: string; source: 'committed-tree'; excludesWorkingTree: true; eligibleFiles: number; excludedEntries: number }>;
  readonly #entries: ReadonlyMap<string, Entry>;
  readonly #repoId: string;
  readonly #root: string;
  readonly #executable: string;
  readonly #scope: PathScopeValue | undefined;
  private constructor(repos: RepoRegistry, secrets: SecretFilter, repoId: string, root: string, executable: string, baseCommit: string, entries: Map<string, Entry>, excludedEntries: number, scope?: PathScopeValue) {
    super(repos, secrets);
    this.#repoId = repoId;
    this.#root = root;
    this.#executable = executable;
    this.#entries = entries;
    this.#scope = scope;
    const hash = scope ? scopeHash(scope) : undefined;
    this.metadata = Object.freeze({ baseCommit, snapshotId: scopedSnapshotId(baseCommit, hash), ...(hash ? { scopeHash: hash } : {}), source: 'committed-tree', excludesWorkingTree: true, eligibleFiles: entries.size, excludedEntries });
  }

  static async capture(repos: RepoRegistry, repoId: string, baseRef = 'HEAD', secrets = new SecretFilter(), rawScope?: PathScopeValue) {
    const scope = rawScope === undefined ? undefined : PathScope.parse(rawScope);
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(baseRef) || baseRef.includes('..')) throw new Error('INVALID_BASE_REF');
    const root = repos.root(repoId);
    const executable = await resolveExecutable('git');
    if (!executable) throw new Error('GIT_UNAVAILABLE');
    const top = (await git(executable, root, ['rev-parse', '--show-toplevel'], 16_384)).toString('utf8').trim();
    if (await realpath(top) !== root) throw new Error('GIT_ROOT_REQUIRED');
    const baseCommit = (await git(executable, root, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`], 128)).toString('utf8').trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baseCommit)) throw new Error('INVALID_COMMIT_ID');
    const buffer = await git(executable, root, ['ls-tree', '-r', '-l', '-z', '--full-tree', baseCommit], 2 * 1024 * 1024);
    let listing: string;
    try { listing = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('INVALID_GIT_PATH_ENCODING'); }
    const rows = listing.split('\0').filter(Boolean);
    if (rows.length > 10_000) throw new Error('SNAPSHOT_LIMIT');
    const entries = new Map<string, Entry>();
    let excluded = 0;
    for (const row of rows) {
      const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\s+(\d+|-)\t([\s\S]+)$/.exec(row);
      if (!match) throw new Error('INVALID_GIT_TREE');
      const [, mode, type, oid, sizeText, path] = match;
      if (!path || !oid || !['100644', '100755'].includes(mode ?? '') || type !== 'blob' || isDeniedPath(path) || secrets.filter(path).redacted) { excluded++; continue; }
      if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f\x7f:]/.test(path)) { excluded++; continue; }
      const size = Number(sizeText);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('INVALID_GIT_TREE');
      if (size > 1_048_576) { excluded++; continue; }
      if (!inScope(path, scope)) { excluded++; continue; }
      entries.set(path, Object.freeze({ oid, size }));
    }
    return new GitSnapshotTools(repos, secrets, repoId, root, executable, baseCommit, entries, excluded, scope);
  }

  override async listFiles(repoId: string, cursor = '', limit = 200, signal = new AbortController().signal) {
    this.#checkRepo(repoId);
    signal.throwIfAborted();
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('INVALID_LIST_LIMIT');
    const paths = [...this.#entries.keys()].sort().filter(path => path > cursor);
    const files = paths.slice(0, Math.min(limit, 500));
    const truncated = paths.length > files.length;
    return { files, nextCursor: truncated ? files.at(-1) ?? null : null, truncated };
  }

  override async readSearchText(repoId: string, path: string) {
    this.#checkRepo(repoId);
    if (!inScope(path, this.#scope)) throw new Error('SCOPE_PATH_DENIED');
    const entry = this.#entries.get(path);
    if (!entry) throw new Error('PATH_DENIED');
    const content = await git(this.#executable, this.#root, ['cat-file', 'blob', entry.oid], 1_048_576);
    const algorithm = entry.oid.length === 40 ? 'sha1' : 'sha256';
    const actual = createHash(algorithm).update(`blob ${content.length}\0`).update(content).digest('hex');
    if (content.length !== entry.size || actual !== entry.oid) throw new Error('SNAPSHOT_INTEGRITY_FAILED');
    return this.filterContent(content, path);
  }

  override get provenance() { return { baseCommit: this.metadata.baseCommit, snapshotId: this.metadata.snapshotId }; }

  #checkRepo(repoId: string) { if (repoId !== this.#repoId) throw new Error('UNKNOWN_REPO'); }
}
