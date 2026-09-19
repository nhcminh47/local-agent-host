import { execFile } from 'node:child_process';
import { totalmem, platform, arch } from 'node:os';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const exec = promisify(execFile);
const Version = z.object({ version: z.string() });
const Models = z.object({ models: z.array(z.object({ name: z.string(), size: z.number().optional(), digest: z.string().optional() })) });

export function endpoint(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use an HTTP(S) origin without credentials, path, query or fragment');
  }
  return url;
}

async function version(command: string, args: string[]) {
  try {
    const { stdout } = await exec(command, args, { timeout: 5000, windowsHide: true, maxBuffer: 16384 });
    return { status: 'ok', version: stdout.trim().split(/\r?\n/)[0] };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function probeOllama(origin: URL) {
  try {
    const fetchJson = async (route: string) => {
      const token = process.env['OLLAMA_API_KEY'];
      const response = await fetch(new URL(route, origin), { signal: AbortSignal.timeout(5000), redirect: 'error', ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });
      if (!response.ok) throw new Error('Endpoint returned an error');
      return response.json();
    };
    const info = Version.parse(await fetchJson('/api/version'));
    const inventory = Models.parse(await fetchJson('/api/tags'));
    return { status: 'ok', version: info.version, models: inventory.models };
  } catch {
    // Do not serialize request/response bodies or URLs into error diagnostics.
    return { status: 'unavailable', reason: 'Connection, HTTP or response-schema check failed' };
  }
}

export async function doctor() {
  const [git, rg, ollama] = await Promise.all([
    version('git', ['--version']),
    version('rg', ['--version']),
    probeOllama(endpoint(process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434')),
  ]);
  return {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    runtime: { node: process.version, targetNode: '22.23.2', matchesTarget: process.version === 'v22.23.2', platform: platform(), arch: arch(), ramGiB: Math.round(totalmem() / 1024 ** 3) },
    git, rg, ollama,
    limitations: ['Local-machine check only; does not verify connectivity from Mac', 'No Cursor integration or sandbox claim'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await doctor();
    console.log(JSON.stringify(result, null, 2));
    if (!result.runtime.matchesTarget || result.git.status !== 'ok' || result.rg.status !== 'ok' || result.ollama.status !== 'ok') process.exitCode = 2;
  } catch {
    console.error('Invalid doctor configuration');
    process.exitCode = 1;
  }
}
