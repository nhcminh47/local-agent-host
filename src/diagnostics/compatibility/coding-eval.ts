import { cases, type EvalCase } from './coding-fixtures.js';
type Message = { role: string; content: string; tool_calls?: unknown[] | undefined; tool_name?: string | undefined };
import { CODING_EVAL_SYSTEM_PROMPT } from '../../prompts/coding-eval.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { endpoint } from './doctor.js';
import { z } from 'zod';


const Call = z.object({ function: z.discriminatedUnion('name', [
  z.object({ name: z.literal('read_file'), arguments: z.object({ path: z.literal('solution.ts') }).strict() }),
  z.object({ name: z.literal('write_file'), arguments: z.object({ path: z.literal('solution.ts'), content: z.string().max(12000) }).strict() }),
  z.object({ name: z.literal('run_tests'), arguments: z.object({}).strict() }),
  z.object({ name: z.literal('finish'), arguments: z.object({ summary: z.string().max(500) }).strict() }),
]) });

const origin = endpoint(process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434');
const token = process.env['OLLAMA_API_KEY'];
const models = process.argv.slice(2);
if (!models.length) throw new Error('Supply installed model names; this evaluator never pulls models');
const selectedCase = process.env['M0_EVAL_CASE'];
const selectedCases = selectedCase ? cases.filter(testCase => testCase.id === selectedCase) : cases;
if (!selectedCases.length) throw new Error(`Unknown M0_EVAL_CASE: ${selectedCase}`);

async function runNode(args: string[], cwd: string) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const append = (chunk: Buffer) => { if (output.length < 16000) output += chunk.toString('utf8'); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const timer = setTimeout(() => child.kill(), 10000);
    child.once('error', reject);
    child.once('close', code => { clearTimeout(timer); resolve({ code, output: output.slice(0, 16000) }); });
  });
}

async function chat(model: string, messages: Message[]) {
  const response = await fetch(new URL('/api/chat', origin), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ model, messages, stream: false, keep_alive: '5m', options: { num_ctx: 8192, num_predict: 1000, temperature: 0 },
      ...(model.startsWith('qwen3') ? { think: false } : {}),
      ...(model.startsWith('gpt-oss:') ? { think: 'low' } : {}),
      tools: [
      { type: 'function', function: { name: 'read_file', description: 'Read solution.ts.', parameters: { type: 'object', properties: { path: { type: 'string', enum: ['solution.ts'] } }, required: ['path'], additionalProperties: false } } },
      { type: 'function', function: { name: 'write_file', description: 'Replace solution.ts with complete TypeScript source.', parameters: { type: 'object', properties: { path: { type: 'string', enum: ['solution.ts'] }, content: { type: 'string' } }, required: ['path','content'], additionalProperties: false } } },
      { type: 'function', function: { name: 'run_tests', description: 'Compile solution.ts and run hidden tests.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
      { type: 'function', function: { name: 'finish', description: 'Finish only after tests pass.', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false } } },
    ] }),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const body = z.object({ message: z.object({ role: z.string(), content: z.string().default(''), tool_calls: z.array(z.unknown()).optional() }), prompt_eval_count: z.number().optional(), eval_count: z.number().optional(), total_duration: z.number().optional() }).parse(await response.json());
  return body;
}

async function evaluate(model: string, task: EvalCase) {
  const dir = await mkdtemp(join(tmpdir(), `agent-m0-${task.id}-`));
  const solution = join(dir, 'solution.ts');
  await writeFile(solution, task.initial, 'utf8');
  await writeFile(join(dir, 'hidden-test.mjs'), task.hiddenTests, 'utf8');
  const messages: Message[] = [{ role: 'system', content: CODING_EVAL_SYSTEM_PROMPT }, { role: 'user', content: task.objective }];
  const started = performance.now();
  let toolCalls = 0, modelTurns = 0, testRuns = 0, writes = 0, passed = false, finished = false;
  try {
    for (; modelTurns < 10 && toolCalls < 20 && !finished; modelTurns++) {
      const response = await chat(model, messages);
      const assistant = response.message;
      messages.push(assistant);
      const calls = assistant.tool_calls ?? [];
      if (!calls.length) { messages.push({ role: 'user', content: 'Use the available tools to complete the task.' }); continue; }
      for (const raw of calls) {
        toolCalls++;
        let result: string;
        try {
          const call = Call.parse(raw).function;
          if (call.name === 'read_file') result = await readFile(solution, 'utf8');
          else if (call.name === 'write_file') { await writeFile(solution, call.arguments.content, 'utf8'); writes++; passed = false; result = 'WRITE_OK'; }
          else if (call.name === 'run_tests') {
            testRuns++;
            const compile = await runNode([join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), 'solution.ts', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', '.', '--skipLibCheck'], dir);
            const test = compile.code === 0 ? await runNode(['hidden-test.mjs'], dir) : compile;
            passed = compile.code === 0 && test.code === 0;
            result = passed ? 'PASS' : `FAIL\n${test.output.slice(0, 4000)}`;
          } else { finished = passed; result = passed ? 'FINISH_ACCEPTED' : 'FINISH_REJECTED_TESTS_NOT_PASSING'; }
        } catch { result = 'TOOL_INPUT_REJECTED'; }
        messages.push({ role: 'tool', tool_name: (() => { try { return Call.parse(raw).function.name; } catch { return 'invalid_tool'; } })(), content: result });
      }
    }
    const finalCompile = await runNode([join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc'), 'solution.ts', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--outDir', '.', '--skipLibCheck'], dir);
    const finalTest = finalCompile.code === 0 ? await runNode(['hidden-test.mjs'], dir) : finalCompile;
    const finalPass = finalCompile.code === 0 && finalTest.code === 0;
    return {
      schemaVersion: 1,
      model,
      task: task.id,
      status: finalPass ? 'passed' : 'failed',
      finishedAfterPass: finished && passed,
      modelTurns,
      toolCalls,
      writes,
      testRuns,
      wallMs: Math.round(performance.now() - started),
      ...(!finalPass ? {
        finalSource: await readFile(solution, 'utf8'),
        finalTestOutput: finalTest.output.slice(0, 4000),
      } : {}),
    };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

for (const model of models) for (const task of selectedCases) {
  try { console.log(JSON.stringify(await evaluate(model, task))); }
  catch (error) { console.log(JSON.stringify({ model, task: task.id, status: 'error', error: error instanceof Error && /^HTTP_\d+$/.test(error.message) ? error.message : 'NETWORK_TIMEOUT_OR_SCHEMA_ERROR' })); process.exitCode = 2; }
}
