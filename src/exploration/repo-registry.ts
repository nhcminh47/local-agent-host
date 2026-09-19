import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export class UnknownRepo extends Error { constructor() { super('UNKNOWN_REPO'); } }
export class PathDenied extends Error { constructor() { super('PATH_DENIED'); } }

export class RepoRegistry {
  readonly #roots = new Map<string, string>();
  readonly #idsByRoot = new Map<string, string>();

  async register(repoId: string, root: string): Promise<string> {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(repoId)) throw new Error('INVALID_REPO_ID');
    const canonical = await realpath(resolve(root));
    if (!(await stat(canonical)).isDirectory()) throw new Error('REPO_NOT_DIRECTORY');
    const existing = this.#idsByRoot.get(canonical.toLowerCase());
    if (existing && existing !== repoId) throw new Error('DUPLICATE_REPO_ROOT');
    this.#roots.set(repoId, canonical);
    this.#idsByRoot.set(canonical.toLowerCase(), repoId);
    return canonical;
  }

  root(repoId: string): string {
    const root = this.#roots.get(repoId);
    if (!root) throw new UnknownRepo();
    return root;
  }

  async resolveFile(repoId: string, repoPath: string): Promise<{ root: string; path: string; relativePath: string }> {
    if (!repoPath || repoPath.includes('\0') || repoPath.startsWith('/') || repoPath.startsWith('\\') || /^[A-Za-z]:/.test(repoPath) || repoPath.split(/[\\/]/).includes('..')) throw new PathDenied();
    const root = this.root(repoId);
    const candidate = await realpath(resolve(root, repoPath));
    const rel = relative(root, candidate);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== candidate) throw new PathDenied();
    return { root, path: candidate, relativePath: rel.split(sep).join('/') };
  }
}
