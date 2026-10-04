import { resolveExecutable } from '../exploration/capabilities.js';
import type { HostConfigValue } from '../domain/host-config-contracts.js';

async function probeModels(url: string): Promise<{ reachable: boolean; models: string[] }> {
  try {
    const token = process.env['OLLAMA_API_KEY'];
    const response = await fetch(new URL('/api/tags', url), { redirect: 'error', signal: AbortSignal.timeout(3_000), headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) >= 1_000_000) return { reachable: false, models: [] };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1_000_000) { await reader.cancel(); return { reachable: false, models: [] }; }
      chunks.push(part.value);
    }
    const data: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    if (!data || typeof data !== 'object' || !('models' in data) || !Array.isArray(data.models)) return { reachable: false, models: [] };
    return { reachable: true, models: data.models.filter(item => item && typeof item === 'object' && 'name' in item && typeof item.name === 'string').map(item => String(item.name)).filter((name: string) => ['qwen3:8b', 'gpt-oss:20b', 'qwen3.5:latest'].includes(name)).slice(0, 20) };
  } catch { return { reachable: false, models: [] }; }
}

export async function availableModels(url: string): Promise<string[]> { return (await probeModels(url)).models; }

export async function readiness(config: HostConfigValue | null, hasToken: boolean) {
  const git = Boolean(await resolveExecutable('git'));
  const pnpm = Boolean(process.env['npm_config_user_agent']?.startsWith('pnpm/')) || Boolean(await resolveExecutable('pnpm'));
  let providerReachable = false;
  let modelAvailable = false;
  if (config) {
    const probe = await probeModels(config.ollamaUrl);
    providerReachable = probe.reachable;
    modelAvailable = probe.models.includes(config.model);
  }
  let daemonReachable = false;
  if (config) {
    try { await fetch(`http://127.0.0.1:${config.daemonPort}/`, { signal: AbortSignal.timeout(1_000) }); daemonReachable = true; }
    catch { /* Daemon must be started separately. */ }
  }
  return { configured: Boolean(config), credentialPresent: hasToken, nodeCompatible: Number(process.versions.node.split('.')[0]) === 22, pnpm, git, providerReachable, modelAvailable, daemonReachable };
}
