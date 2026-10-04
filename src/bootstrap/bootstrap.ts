import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { readHostConfig, readHostToken, ensureHostToken, ensureManagementToken, writeHostConfig } from './host-config.js';
import { userStateDir } from './user-state.js';
import { availableModels, readiness } from './readiness.js';
import { installCursorEntry } from './client-adapters/cursor.js';
import type { HostConfigValue } from '../domain/host-config-contracts.js';
import { HostConfig } from '../domain/host-config-contracts.js';

export async function bootstrap(args: string[]): Promise<void> {
  if (args.some(arg => !['--check', '--reconfigure'].includes(arg)) || args.length > 1) throw new Error('BOOTSTRAP_USAGE');
  const existing = await readHostConfig();
  const check = args.includes('--check');
  if (check) { console.log(JSON.stringify(await readiness(existing, Boolean(await readHostToken())))); return; }
  const reconfigure = args.includes('--reconfigure');
  let config = existing;
  if (!config || reconfigure) {
    if (!process.stdin.isTTY) throw new Error('INTERACTIVE_SETUP_REQUIRED');
    const input = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const ask = async (label: string, fallback: string) => (await input.question(`${label} [${fallback}]: `)).trim() || fallback;
      const client = await ask('MCP client (cursor/manual)', config?.clientAdapter ?? 'manual');
      if (!['cursor', 'manual'].includes(client)) throw new Error('INVALID_CLIENT_ADAPTER');
      const ollamaUrl = await ask('Ollama URL', config?.ollamaUrl ?? 'http://127.0.0.1:11434');
      const models = await availableModels(ollamaUrl);
      if (models.length) process.stderr.write(`Available supported models: ${models.join(', ')}\n`);
      config = HostConfig.parse({
        schemaVersion: 1,
        daemonPort: Number(await ask('Daemon port', String(config?.daemonPort ?? 43127))),
        databasePath: config?.databasePath ?? join(userStateDir(), 'tasks.db'),
        provider: 'explorer',
        ollamaUrl,
        model: await ask('Installed Ollama model', config?.model ?? models[0] ?? 'qwen3:8b'),
        clientAdapter: client as HostConfigValue['clientAdapter'],
      });
      await writeHostConfig(config);
      await ensureHostToken();
      await ensureManagementToken();
      if (config.clientAdapter === 'cursor') await installCursorEntry(resolve('.'));
    } finally { input.close(); }
  } else { await ensureHostToken(); await ensureManagementToken(); }
  console.log(JSON.stringify(await readiness(config, Boolean(await readHostToken()))));
  console.log(`Start the daemon with: ${process.execPath} ${resolve('dist/src/runtime/daemon.js')}`);
  if (config.clientAdapter === 'manual') console.log(JSON.stringify({ mcpServers: { 'local-agent-host': { command: process.execPath, args: [resolve('dist/src/runtime/mcp-server.js')] } } }, null, 2));
}
