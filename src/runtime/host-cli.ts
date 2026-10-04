import { createInterface } from 'node:readline/promises';
import { readHostConfig, readManagementToken } from '../bootstrap/host-config.js';
import { DaemonClient } from './ipc-client.js';

async function confirm(message: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error('INTERACTIVE_CONFIRMATION_REQUIRED');
  const input = createInterface({ input: process.stdin, output: process.stderr });
  try { if ((await input.question(`${message} Type yes to confirm: `)).trim() !== 'yes') throw new Error('ACTION_DENIED'); }
  finally { input.close(); }
}

async function main(args: string[]) {
  const config = await readHostConfig();
  const token = await readManagementToken();
  if (!config || !token) throw new Error('HOST_NOT_CONFIGURED');
  const daemon = new DaemonClient(process.env['LOCAL_AGENT_DAEMON_URL'] ?? `http://127.0.0.1:${config.daemonPort}`, token);
  if (args[0] !== 'workspace') throw new Error('HOST_USAGE');
  const command = args[1];
  let value: unknown;
  if (command === 'select' && args.length === 3) value = await daemon.call('workspace-select', { path: args[2] });
  else if (command === 'list' && args.length === 2) value = await daemon.call('workspace-list', {});
  else if (command === 'trust' && args.length === 4 && ['--once', '--always'].includes(args[3]!)) {
    await confirm(`Grant read access to ${args[2]}?`);
    value = await daemon.call('workspace-grant', { workspaceRef: args[2], mode: args[3] === '--once' ? 'once' : 'durable' });
  } else if (command === 'revoke' && args.length === 3) {
    await confirm(`Revoke read access to ${args[2]}?`);
    value = await daemon.call('workspace-revoke', { workspaceRef: args[2] });
  } else if (command === 'deny' && args.length === 3) value = await daemon.call('workspace-deny', { workspaceRef: args[2] });
  else throw new Error('HOST_USAGE');
  console.log(JSON.stringify(value));
}

try { await main(process.argv.slice(2)); }
catch (error) { console.error(error instanceof Error ? error.message : 'HOST_FAILED'); process.exitCode = 1; }
