import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./mcp-server.js', import.meta.url))],
  stderr: 'pipe',
});
const client = new Client({ name: 'm0-smoke', version: '0.0.0' });
const deadline = setTimeout(() => { console.error('MCP smoke deadline exceeded'); process.exit(1); }, 15000);
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert(tools.some(tool => tool.name === 'm0_echo'));
  const result = await client.callTool({ name: 'm0_echo', arguments: { text: 'm0-roundtrip' } });
  assert.deepEqual(result.content, [{ type: 'text', text: 'm0-roundtrip' }]);
  const invalid = await client.callTool({ name: 'm0_echo', arguments: { text: 'x'.repeat(129) } });
  assert.equal(invalid.isError, true);
  console.log(JSON.stringify({ status: 'passed', sdk: '2.0.0', checks: ['initialize', 'listTools', 'callTool', 'invalid input rejected'], scope: 'SDK client/server only; Cursor not tested' }));
} finally {
  await client.close();
  clearTimeout(deadline);
}
