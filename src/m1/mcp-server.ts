import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AnalyzeRepoInput, CancelTaskInput, GetTaskInput } from '../domain/task-contracts.js';
import { DaemonClient } from './ipc-client.js';
import { CheckCapabilityInput, ResolveCapabilityInput } from '../exploration/capability-service.js';

const token = process.env['LOCAL_AGENT_IPC_TOKEN'];
if (!token) throw new Error('LOCAL_AGENT_IPC_TOKEN is required');
const daemon = new DaemonClient(process.env['LOCAL_AGENT_DAEMON_URL'] ?? 'http://127.0.0.1:43127', token);
const server = new McpServer({ name: 'local-agent-bridge', version: '0.1.0' });
const response = (value: unknown, isError = false) => ({ ...(isError ? { isError: true } : {}), content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> });

server.registerTool('analyze_repo', { description: 'Durably submit a read-only analysis task to the local daemon.', inputSchema: AnalyzeRepoInput }, async raw => {
  try { return response(await daemon.call('submit', raw)); }
  catch (error) { return response({ schemaVersion: 1, error: error instanceof Error ? error.message : 'DAEMON_UNAVAILABLE' }, true); }
});
server.registerTool('get_task', { description: 'Read durable task status and bounded events from the local daemon.', inputSchema: GetTaskInput }, async raw => {
  try { return response(await daemon.call('get', raw)); }
  catch (error) { return response({ schemaVersion: 1, error: error instanceof Error ? error.message : 'DAEMON_UNAVAILABLE' }, true); }
});
server.registerTool('cancel_task', { description: 'Request idempotent task cancellation through the local daemon.', inputSchema: CancelTaskInput }, async raw => {
  try { return response(await daemon.call('cancel', raw)); }
  catch (error) { return response({ schemaVersion: 1, error: error instanceof Error ? error.message : 'DAEMON_UNAVAILABLE' }, true); }
});
server.registerTool('check_capability', { description: 'Check the host ripgrep capability and saved Node fallback preference.', inputSchema: CheckCapabilityInput }, async raw => {
  try { return response(await daemon.call('check-capability', raw)); }
  catch (error) { return response({ schemaVersion: 1, error: error instanceof Error ? error.message : 'DAEMON_UNAVAILABLE' }, true); }
});
server.registerTool('resolve_capability', { description: 'Record the user-selected host-wide Node fallback, recheck manual installation, or cancel this capability request. Does not install software or cancel tasks.', inputSchema: ResolveCapabilityInput }, async raw => {
  try { return response(await daemon.call('resolve-capability', raw)); }
  catch (error) { return response({ schemaVersion: 1, error: error instanceof Error ? error.message : 'DAEMON_UNAVAILABLE' }, true); }
});
await server.connect(new StdioServerTransport());
