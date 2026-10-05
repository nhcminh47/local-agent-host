import { createInterface } from 'node:readline/promises';
import { readHostConfig, readManagementToken } from '../bootstrap/host-config.js';
import { readFile } from 'node:fs/promises';
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
  if (args[0] === 'baseline' && args[1] === 'inspect' && args.length === 3) {
    console.log(JSON.stringify(await daemon.call('baseline-inspect', { taskId: args[2] })));
    return;
  }
  if (args[0] === 'spec') {
    const command = args[1];
    let value: unknown;
    if (command === 'register' && args.length === 4) value = await daemon.call('spec-register', { taskId: args[2], specId: args[3] });
    else if (command === 'list' && args.length === 3) value = await daemon.call('spec-list', { taskId: args[2] });
    else if (command === 'inspect' && args.length === 3) value = await daemon.call('spec-inspect', { recordId: args[2] });
    else if (command === 'hygiene' && args.length === 3) value = await daemon.call('spec-hygiene', { taskId: args[2] });
    else if (command === 'finalize' && args.length === 4) {
      await confirm(`Finalize spec record ${args[2]} using ${args[3]}?`);
      const summary = JSON.parse(await readFile(args[3]!, 'utf8')) as unknown;
      value = await daemon.call('spec-finalize', { recordId: args[2], summary });
    } else {
      const actions: Record<string, string> = { activate: 'activate', archive: 'archive', restore: 'restore', retire: 'retire', cleanup: 'mark_cleanup_eligible', cancel: 'cancel', supersede: 'supersede' };
      const action = command ? actions[command] : undefined;
      if (!action || args.length < 4 || command === 'supersede' && args.length < 5) throw new Error('HOST_USAGE');
      await confirm(`${command} spec record ${args[2]}?`);
      value = await daemon.call('spec-transition', { recordId: args[2], action, reason: args.slice(command === 'supersede' ? 4 : 3).join(' '), ...(command === 'supersede' ? { supersededBy: args[3] } : {}) });
    }
    console.log(JSON.stringify(value));
    return;
  }
  if (args[0] === 'learning') {
    const command = args[1];
    let value: unknown;
    if (command === 'propose' && args.length === 4) value = await daemon.call('learning-propose', { taskId: args[2], findingId: args[3] });
    else if (command === 'list' && args.length === 3) value = await daemon.call('learning-list', { taskId: args[2] });
    else if (command === 'inspect' && args.length === 3) value = await daemon.call('learning-inspect', { itemId: args[2] });
    else if (['promote', 'reject', 'retire'].includes(command ?? '') && args.length >= 4) {
      await confirm(`${command} learning item ${args[2]}?`);
      value = await daemon.call('learning-decide', { itemId: args[2], action: command, reason: args.slice(3).join(' ') });
    } else throw new Error('HOST_USAGE');
    console.log(JSON.stringify(value));
    return;
  }
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
