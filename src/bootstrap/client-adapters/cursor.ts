import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readPrivateText, atomicPrivateWrite } from '../user-state.js';

export async function installCursorEntry(projectRoot: string, configPath = join(homedir(), '.cursor', 'mcp.json')): Promise<void> {
  const prior = await readPrivateText(configPath);
  let document: Record<string, unknown> = {};
  if (prior !== null) {
    const parsed: unknown = JSON.parse(prior);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_CURSOR_CONFIG');
    document = parsed as Record<string, unknown>;
    if (document['mcpServers'] !== undefined && (!document['mcpServers'] || typeof document['mcpServers'] !== 'object' || Array.isArray(document['mcpServers']))) throw new Error('INVALID_CURSOR_CONFIG');
    await atomicPrivateWrite(`${configPath}.bak`, prior);
  }
  const servers = document['mcpServers'] as Record<string, unknown> | undefined;
  document['mcpServers'] = { ...servers, 'local-agent-host': { command: process.execPath, args: [resolve(projectRoot, 'dist', 'src', 'runtime', 'mcp-server.js')] } };
  await atomicPrivateWrite(configPath, `${JSON.stringify(document, null, 2)}\n`);
}
