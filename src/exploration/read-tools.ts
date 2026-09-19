import { createHash } from 'node:crypto';
import { opendir, open } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { RepoRegistry } from './repo-registry.js';
import { matchBuiltin } from './search-backends.js';
import { searchFiles } from './search-engine.js';
import { SecretFilter } from './secret-filter.js';

const denied = (path: string) => path.toLowerCase().split(/[\\/]/).some(part => part === '.git' || part === 'node_modules' || part === '.env' || part.startsWith('.env.'));
export const isDeniedPath = denied;
const normalize = (path: string) => path.split(sep).join('/');

export class ReadTools {
  constructor(readonly repos: RepoRegistry, readonly secrets = new SecretFilter()) {}
  get provenance(): { baseCommit: string; snapshotId: string } | null { return null; }

  async readFile(repoId: string, repoPath: string, startLine = 1, endLine = startLine + 199) {
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine) throw new Error('INVALID_LINE_RANGE');
    const file = await this.readSearchText(repoId, repoPath);
    const lines = file.text.split('\n');
    const first = Math.max(1, startLine);
    const last = Math.min(lines.length, endLine, first + 499);
    const content = lines.slice(first - 1, last).map((line, index) => `${first + index}: ${line}`).join('\n');
    return { path: file.path, startLine: first, endLine: last, content: content.slice(0, 64 * 1024), truncated: last < lines.length || content.length > 64 * 1024, sha256: file.sha256, hashScope: 'filtered-text', redacted: file.redacted, ...(this.provenance ? { snapshot: this.provenance } : {}) };
  }

  async listFiles(repoId: string, cursor = '', limit = 200, signal = new AbortController().signal) {
    const root = this.repos.root(repoId);
    const files: string[] = [];
    let entries = 0;
    const walk = async (dir: string, depth = 0): Promise<void> => {
      signal.throwIfAborted();
      if (depth > 64) throw new Error('LIST_LIMIT');
      for await (const entry of await opendir(dir)) {
        signal.throwIfAborted();
        if (++entries > 20_000) throw new Error('LIST_LIMIT');
        const rel = normalize(relative(root, join(dir, entry.name)));
        if (denied(rel) || this.secrets.filter(rel).redacted) continue;
        if (entry.isDirectory()) await walk(join(dir, entry.name), depth + 1);
        else if (entry.isFile()) files.push(rel);
      }
    };
    await walk(root);
    files.sort();
    const found = cursor ? files.findIndex(path => path > cursor) : 0;
    const start = found < 0 ? files.length : found;
    const page = files.slice(start, start + Math.min(500, Math.max(1, limit)));
    return { files: page, nextCursor: start + page.length < files.length ? page.at(-1) ?? null : null, truncated: start + page.length < files.length };
  }

  async searchBuiltin(repoId: string, pattern: string, maxMatches = 100) {
    return searchFiles(this, { schemaVersion: 1, repoId, pattern, maxMatches }, 'node', matchBuiltin);
  }

  async readSearchText(repoId: string, repoPath: string) {
    if (denied(repoPath) || this.secrets.filter(repoPath).redacted) throw new Error('PATH_DENIED');
    const resolved = await this.repos.resolveFile(repoId, repoPath);
    if (denied(resolved.relativePath) || this.secrets.filter(resolved.relativePath).redacted) throw new Error('PATH_DENIED');
    const handle = await open(resolved.path, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 1_048_576) throw new Error('FILE_NOT_READABLE');
      // Read at most one byte beyond the limit, including files growing during read.
      const buffer = Buffer.alloc(1_048_577);
      let bytes = 0;
      while (bytes < buffer.length) {
        const read = await handle.read(buffer, bytes, buffer.length - bytes, null);
        if (!read.bytesRead) break;
        bytes += read.bytesRead;
      }
      if (bytes > 1_048_576) throw new Error('FILE_NOT_READABLE');
      return this.filterContent(buffer.subarray(0, bytes), resolved.relativePath);
    } finally { await handle.close(); }
  }

  protected filterContent(content: Buffer, path: string) {
    if (content.includes(0)) throw new Error('BINARY_FILE');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content); }
    catch { throw new Error('INVALID_UTF8'); }
    const filtered = this.secrets.filter(text);
    const safeText = filtered.text.replace(/\r\n/g, '\n');
    return { text: safeText, bytes: content.length, path, redacted: filtered.redacted, sha256: createHash('sha256').update(safeText).digest('hex') };
  }
}
