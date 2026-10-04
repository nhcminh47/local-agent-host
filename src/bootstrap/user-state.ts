import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export function userStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env['LOCAL_AGENT_STATE_DIR'];
  if (override) {
    if (!isAbsolute(override)) throw new Error('INVALID_STATE_DIR');
    return resolve(override);
  }
  return process.platform === 'win32'
    ? join(env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'local-agent-host')
    : join(env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'local-agent-host');
}

export async function atomicPrivateWrite(path: string, data: string): Promise<void> {
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(data, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

export async function readPrivateText(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
