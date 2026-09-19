import { spawn } from 'node:child_process';

export type LineMatcher = (text: string, pattern: string, limit: number, signal: AbortSignal) => Promise<number[]>;

export const matchBuiltin: LineMatcher = async (text, pattern, limit, signal) => {
  signal.throwIfAborted();
  const found: number[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (line.includes(pattern)) found.push(index + 1);
    if (found.length >= limit) break;
  }
  return found;
};

// Search only bounded bytes supplied by the host. rg never traverses the repository.
// --no-config prevents user config from enabling preprocessors or changing semantics.
export function ripgrepMatcher(executable: string): LineMatcher {
  return async (text, pattern, limit, signal) => {
    signal.throwIfAborted();
    const output = await new Promise<string>((resolve, reject) => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path', 'systemroot', 'windir', 'pathext', 'temp', 'tmp'].includes(key.toLowerCase())));
      const child = spawn(executable, ['--no-config', '--fixed-strings', '--case-sensitive', '--text', '--encoding=none', '--color=never', '--no-heading', '--no-filename', '--line-number', '--max-count', String(limit), '--', pattern, '-'], {
        shell: false, windowsHide: true, env, stdio: ['pipe', 'pipe', 'ignore'],
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      let failure: string | undefined;
      const stop = (code: string) => { failure ??= code; child.kill(); };
      const abort = () => stop('SEARCH_CANCELLED');
      signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => stop('SEARCH_TIMEOUT'), 2_000);
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) stop('SEARCH_OUTPUT_LIMIT');
        else chunks.push(chunk);
      });
      child.stdin.on('error', error => {
        // rg may stop reading after --max-count before the host finishes writing.
        if ((error as NodeJS.ErrnoException).code !== 'EPIPE') stop('SEARCH_INPUT_FAILED');
      });
      child.once('error', () => { failure ??= 'RIPGREP_UNAVAILABLE'; });
      child.once('close', code => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
        if (failure) reject(new Error(failure));
        else if (code !== 0 && code !== 1) reject(new Error('RIPGREP_FAILED'));
        else resolve(Buffer.concat(chunks).toString('utf8'));
      });
      if (signal.aborted) abort();
      child.stdin.end(text);
    });
    const source = text.split('\n');
    const found: number[] = [];
    for (const row of output.split('\n')) {
      if (!row) continue;
      const match = /^(\d+):([\s\S]*)$/.exec(row);
      const line = Number(match?.[1]);
      if (!match || !Number.isSafeInteger(line) || line <= (found.at(-1) ?? 0) || source[line - 1] !== match[2] || !source[line - 1]?.includes(pattern) || found.length >= limit) throw new Error('RIPGREP_INVALID_OUTPUT');
      found.push(line);
    }
    return found;
  };
}
