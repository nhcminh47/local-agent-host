import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import { OllamaExplorerProvider } from '../src/provider/explorer-provider.js';
import { ExplorerOptions, type InferenceMetric } from '../src/provider/explorer-provider.js';

const canary = 'synthetic-provider-private-canary';
async function fixture(handler: RequestListener, run: (provider: OllamaExplorerProvider, origin: string) => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  try { await run(new OllamaExplorerProvider(origin, 'fixture-token'), origin); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const chat = (provider: OllamaExplorerProvider, signal = AbortSignal.timeout(3000)) => provider.chat([{ role: 'user', content: 'Read fixture' }], [], signal);

test('host model profiles are bounded and inference metrics omit arbitrary response text', async () => {
  assert.equal(ExplorerOptions.safeParse({ num_ctx: 65536 }).success, false);
  assert.equal(ExplorerOptions.safeParse({ num_predict: -1 }).success, false);
  assert.equal(ExplorerOptions.safeParse({ model: 'unregistered-model' }).success, false);
  const metrics: InferenceMetric[] = [];
  await fixture(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(input.options.num_ctx, 16384); assert.equal(input.options.num_predict, 2048);
    res.end(JSON.stringify({ message: { role: 'assistant', content: canary }, prompt_eval_count: 123, eval_count: 2048, done_reason: 'length', extra: canary }));
  }, async (_provider, origin) => {
    await chat(new OllamaExplorerProvider(origin, 'fixture-token', { num_ctx: 16384, num_predict: 2048 }, metric => metrics.push(metric)));
    assert.equal(metrics[0]!.promptTokens, 123); assert.equal(metrics[0]!.generatedTokens, 2048);
    assert.equal(metrics[0]!.doneReason, 'length'); assert(!JSON.stringify(metrics).includes(canary));
  });
});

test('registered fallback model uses its own thinking setting without exposing reasoning', async () => {
  await fixture(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(input.model, 'gpt-oss:20b'); assert.equal(input.think, 'low');
    assert(!('model' in input.options));
    res.end(JSON.stringify({ message: { role: 'assistant', content: 'Done', thinking: canary } }));
  }, async (_provider, origin) => {
    const provider = new OllamaExplorerProvider(origin, 'fixture-token', { model: 'gpt-oss:20b' });
    assert.equal(provider.modelName, 'gpt-oss:20b');
    const result = await chat(provider);
    assert(!JSON.stringify(result).includes(canary));
  });
});
async function rejectsCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, error => {
    assert(error instanceof Error);
    assert.equal(error.message, code);
    assert.equal(String(error).includes(canary), false);
    return true;
  });
}

test('provider rejects HTTP failures without publishing bodies or automatically retrying', async () => {
  for (const status of [401, 429, 500, 503]) {
    let requests = 0;
    await fixture((_req, res) => { requests++; res.writeHead(status).end(canary); }, async provider => {
      await rejectsCode(chat(provider), 'EXPLORER_HTTP_FAILED');
      assert.equal(requests, 1);
    });
  }
});

test('provider rejects malformed JSON, invalid UTF-8 and schema failures with safe errors', async () => {
  const bodies = [canary, Buffer.from([0xff]), JSON.stringify({ message: { role: 'assistant', content: canary, tool_calls: [{ function: { name: 123, arguments: {} } }] } }), JSON.stringify({ message: { role: 'assistant', content: canary.repeat(600) } })];
  for (const body of bodies) {
    await fixture((_req, res) => res.end(body), async provider => rejectsCode(chat(provider), 'EXPLORER_INVALID_RESPONSE'));
  }
});

test('provider aborts oversized responses and reports only a bounded code', async () => {
  await fixture((_req, res) => res.end(canary.repeat(6000)), async provider => rejectsCode(chat(provider), 'EXPLORER_RESPONSE_LIMIT'));
});

test('provider discards partial tool calls when response transport disconnects', async () => {
  await fixture((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100000' });
    res.write('{"message":{"role":"assistant","content":"","tool_calls":[');
    setImmediate(() => res.destroy());
  }, async provider => rejectsCode(chat(provider), 'EXPLORER_TRANSPORT_FAILED'));
});

test('provider refuses redirects rather than forwarding credentials', async () => {
  let targetRequests = 0;
  await fixture((req, res) => {
    if (req.url === '/target') { targetRequests++; res.end(canary); }
    else res.writeHead(302, { Location: '/target' }).end();
  }, async provider => {
    await rejectsCode(chat(provider), 'EXPLORER_TRANSPORT_FAILED');
    assert.equal(targetRequests, 0);
  });
});

test('provider cancellation interrupts a stalled body and closes the connection', async () => {
  let begin!: () => void;
  let closed!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const disconnected = new Promise<void>(resolve => { closed = resolve; });
  await fixture((_req, res) => {
    res.on('close', closed);
    res.writeHead(200); res.write('{'); begin();
  }, async provider => {
    const controller = new AbortController();
    const pending = chat(provider, controller.signal);
    const rejection = assert.rejects(pending, error => error instanceof Error && error.name === 'AbortError');
    await started; controller.abort(); await rejection;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([disconnected, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('CONNECTION_NOT_CLOSED')), 2000); })]); }
    finally { clearTimeout(timer); }
  });
});

test('provider accepts complete chunked UTF-8 only after validating the full response', async () => {
  await fixture((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture-token');
    const body = Buffer.from(JSON.stringify({ message: { role: 'assistant', content: 'Đọc mã nguồn', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'facts.txt' } } }] } }));
    const split = body.indexOf(Buffer.from('Đ')) + 1;
    res.write(body.subarray(0, split)); res.end(body.subarray(split));
  }, async provider => {
    const result = await chat(provider);
    assert.equal(result.content, 'Đọc mã nguồn');
    assert.equal(result.tool_calls?.[0]?.function.name, 'read_file');
  });
});
