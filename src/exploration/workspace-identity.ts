import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { resolveExecutable } from './capabilities.js';
import { WorkspaceIdentity, type WorkspaceIdentityValue } from '../domain/workspace-trust-contracts.js';

function gitValue(executable: string, path: string, argument: '--show-toplevel' | '--absolute-git-dir'): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, ['-C', path, 'rev-parse', argument], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      env: { PATH: process.env['PATH'], SystemRoot: process.env['SystemRoot'], GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    });
    let output = '';
    let failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); }, 5_000);
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); if (output.length > 16_384) { failed = true; child.kill(); } });
    child.once('error', () => { failed = true; });
    child.once('close', code => {
      clearTimeout(timer);
      if (failed || code !== 0 || !output.trim()) reject(new Error('GIT_ROOT_REQUIRED'));
      else resolvePromise(output.trim());
    });
  });
}

export async function resolveWorkspace(path: string): Promise<WorkspaceIdentityValue> {
  if (!path || path.length > 4096) throw new Error('INVALID_WORKSPACE_PATH');
  const input = await realpath(resolve(path));
  if (!(await stat(input)).isDirectory()) throw new Error('INVALID_WORKSPACE_PATH');
  const git = await resolveExecutable('git');
  if (!git) throw new Error('GIT_UNAVAILABLE');
  const root = await realpath(await gitValue(git, input, '--show-toplevel'));
  const markerPath = join(root, '.git');
  const marker = await stat(markerPath);
  const markerRealPath = await realpath(markerPath);
  const gitDir = await realpath(await gitValue(git, input, '--absolute-git-dir'));
  const gitDirStat = await stat(gitDir);
  const fingerprint = createHash('sha256').update(JSON.stringify({ root, markerRealPath, dev: marker.dev, ino: marker.ino, birthtimeMs: marker.birthtimeMs, gitDir, gitDev: gitDirStat.dev, gitIno: gitDirStat.ino, gitBirthtimeMs: gitDirStat.birthtimeMs })).digest('hex');
  const workspaceRef = `ws-${createHash('sha256').update(root).digest('hex').slice(0, 32)}`;
  return WorkspaceIdentity.parse({ schemaVersion: 1, workspaceRef, root, marker: fingerprint });
}
