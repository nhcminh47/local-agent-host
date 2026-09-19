import { spawn } from 'node:child_process';
import { access, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

export type Capability = { status: 'available'; executable: string; version: string } | { status: 'missing'; choices: ['install', 'use_builtin_fallback', 'cancel'] };

// Resolve host-owned executable names without a shell or the current-directory search.
export async function resolveExecutable(executable: string): Promise<string | null> {
  const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const names = process.platform === 'win32' && !executable.toLowerCase().endsWith('.exe') ? [executable + '.exe'] : [executable];
  const candidates = isAbsolute(executable) ? [executable] : /[\\/]/.test(executable) ? [] : pathValue.split(delimiter).filter(isAbsolute).flatMap(dir => names.map(name => join(dir, name)));
  for (const candidate of candidates) {
    try {
      const canonical = await realpath(candidate);
      if (process.platform === 'win32' && !canonical.toLowerCase().endsWith('.exe')) continue;
      if (!(await stat(canonical)).isFile()) continue;
      await access(canonical, constants.X_OK);
      return canonical;
    } catch { /* Try the next host PATH entry. */ }
  }
  return null;
}

export class CapabilityRegistry {
  #ripgrep = new Map<string, Promise<Capability>>();
  ripgrep(executable = 'rg'): Promise<Capability> {
    let result = this.#ripgrep.get(executable);
    if (!result) { result = this.#checkRipgrep(executable); this.#ripgrep.set(executable, result); }
    return result;
  }
  clear() { this.#ripgrep.clear(); }

  async #checkRipgrep(executable: string): Promise<Capability> {
    const resolved = await resolveExecutable(executable);
    if (!resolved) return { status: 'missing', choices: ['install', 'use_builtin_fallback', 'cancel'] };
    return new Promise(resolvePromise => {
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['path', 'systemroot', 'windir', 'pathext', 'temp', 'tmp'].includes(key.toLowerCase())));
      let child;
      try { child = spawn(resolved, ['--no-config', '--version'], { env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); }
      catch { resolvePromise({ status: 'missing', choices: ['install', 'use_builtin_fallback', 'cancel'] }); return; }
      let output = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 2_000);
      child.stdout.on('data', chunk => { output = (output + String(chunk)).slice(0, 512); });
      child.once('error', () => { clearTimeout(timer); resolvePromise({ status: 'missing', choices: ['install', 'use_builtin_fallback', 'cancel'] }); });
      child.once('close', code => {
        clearTimeout(timer);
        if (!timedOut && code === 0 && /^ripgrep \d+\.\d+\.\d+(?:\s|$)/i.test(output.trim())) resolvePromise({ status: 'available', executable: resolved, version: output.trim().split(/\r?\n/, 1)[0] ?? 'unknown' });
        else resolvePromise({ status: 'missing', choices: ['install', 'use_builtin_fallback', 'cancel'] });
      });
    });
  }
}
