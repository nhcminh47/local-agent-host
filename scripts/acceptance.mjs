import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { lstat, readFile, readlink, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { once } from 'node:events';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const host = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(host + '/package.json');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
const { evaluateAcceptanceCase, evaluateGatePair } = await import('../dist/src/evaluation/acceptance-grader.js');
const { EXPLORER_PROMPT_CONTRACT_VERSION, EXPLORER_RESULT_CONTRACT_VERSION } = await import('../dist/src/service/exploration-result-finalizer.js');

const repo = process.env.ACCEPTANCE_REPO ?? 'D:/Repo/novels-engine';
const targetCommit = '987d7891c42df700ec23fbf8f2f68521ed7c184c';
const dir = join(host, '.local');
await mkdir(dir, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (root, ...args) => execFileSync('git', ['--no-optional-locks', '-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const nul = text => text.split('\0').filter(Boolean);

async function hashPath(root, path) {
  const full = join(root, path);
  try {
    const info = await lstat(full);
    if (info.isSymbolicLink()) return `symlink:${hash(await readlink(full))}`;
    if (!info.isFile()) return 'not-file';
    return hash(await readFile(full));
  } catch { return 'missing'; }
}

async function fingerprint() {
  const trackedPaths = nul(git(repo, 'ls-files', '-z'));
  const untrackedPaths = nul(git(repo, 'ls-files', '--others', '--exclude-standard', '-z'));
  const trackedContents = {};
  const untrackedContents = {};
  for (const path of trackedPaths) trackedContents[path] = await hashPath(repo, path);
  for (const path of untrackedPaths) untrackedContents[path] = await hashPath(repo, path);
  return {
    head: git(repo, 'rev-parse', 'HEAD'),
    status: git(repo, 'status', '--porcelain=v1', '--untracked-files=all'),
    index: hash(await readFile(join(repo, '.git/index'))),
    trackedContents,
    untrackedContents,
  };
}

async function sourceRevision() {
  try { return git(host, 'rev-parse', 'HEAD'); }
  catch {
    const paths = nul(git(host, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'));
    const entries = [];
    for (const path of paths.sort()) entries.push([path, await hashPath(host, path)]);
    return `unborn:${hash(JSON.stringify(entries))}`;
  }
}

const before = await fingerprint();
await writeFile(join(dir, 'repos.json'), JSON.stringify({ novels: repo }));
const token = randomBytes(32).toString('hex');
const casesText = await readFile(new URL('./acceptance-cases.json', import.meta.url), 'utf8');
const rubricText = await readFile(new URL('./acceptance-rubric.json', import.meta.url), 'utf8');
const cases = JSON.parse(casesText);
const rubric = JSON.parse(rubricText);
const rubricById = new Map(rubric.cases.map(item => [item.caseId, item]));
if (cases.length !== 5 || cases.some(item => !rubricById.has(item.rubricRef))) throw new Error('INVALID_ACCEPTANCE_SUITE');
const reviewFile = process.env.ACCEPTANCE_REVIEW_FILE;
const reviews = reviewFile ? JSON.parse(await readFile(reviewFile, 'utf8')) : { cases: {} };
const suite = [];
const context = Number(process.env.LOCAL_AGENT_NUM_CTX ?? 8192);
const output = Number(process.env.LOCAL_AGENT_NUM_PREDICT ?? 512);
const model = process.env.LOCAL_AGENT_MODEL ?? 'qwen3:8b';
const runId = process.env.ACCEPTANCE_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-');
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) throw new Error('INVALID_ACCEPTANCE_RUN_ID');
const label = `ctx${context}-out${output}`;
const reportPath = join(dir, `acceptance-${label}-${runId}.json`);
const credentialText = await readFile(process.env.OLLAMA_ENV_FILE ?? 'D:/Repo/ollama/.env', 'utf8');
const modelKey = /^\s*OLLAMA_API_KEY\s*=\s*(.*?)\s*$/m.exec(credentialText)?.[1]?.replace(/^(['"])(.*)\1$/, '$2') ?? '';
if (!modelKey) throw new Error('OLLAMA_CREDENTIAL_UNAVAILABLE');

async function modelState() {
  const response = await fetch(`${process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11435'}/api/tags`, { headers: { Authorization: `Bearer ${modelKey}` }, redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('MODEL_STATE_UNAVAILABLE');
  const body = await response.json();
  const selected = (body.models ?? []).find(item => item.name === model || item.model === model);
  if (!selected?.digest) throw new Error('MODEL_DIGEST_UNAVAILABLE');
  return { name: model, digest: selected.digest, size: selected.size ?? null };
}

const pinnedModel = await modelState();
const frozen = {
  sourceRevision: await sourceRevision(),
  promptContractVersion: EXPLORER_PROMPT_CONTRACT_VERSION,
  resultContractVersion: EXPLORER_RESULT_CONTRACT_VERSION,
  model,
  modelDigest: pinnedModel.digest,
  inferenceSettings: { context, output, temperature: 0, think: model === 'gpt-oss:20b' ? 'low' : false },
  targetCommit,
  casesDigest: hash(casesText),
  rubricDigest: hash(rubricText),
  budgets: { maxWallSeconds: 180, maxModelTurns: 12, maxToolCalls: 16 },
};

const metrics = [];
let metricBuffer = '';
let daemon;
let client;
const env = {
  ...process.env,
  LOCAL_AGENT_TOOL_METRICS: '1',
  LOCAL_AGENT_INFERENCE_METRICS: '1',
  LOCAL_AGENT_PROVIDER: 'explorer',
  LOCAL_AGENT_DB_PATH: join(dir, `acceptance-${runId}.db`),
  LOCAL_AGENT_REPOS_FILE: join(dir, 'repos.json'),
  LOCAL_AGENT_IPC_TOKEN: token,
  LOCAL_AGENT_DAEMON_PORT: '0',
  LOCAL_AGENT_MODEL: model,
  LOCAL_AGENT_NUM_CTX: String(context),
  LOCAL_AGENT_NUM_PREDICT: String(output),
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11435',
  OLLAMA_ENV_FILE: process.env.OLLAMA_ENV_FILE ?? 'D:/Repo/ollama/.env',
};

async function writeReport() {
  const gateRun = { runId, frozen, cases: suite.map(item => item.evaluation) };
  const report = { schemaVersion: 2, generatedAt: new Date().toISOString(), gateRun, modelState: pinnedModel, cases: suite };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return report;
}

try {
  daemon = spawn(process.execPath, [host + '/dist/src/runtime/daemon.js'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  daemon.stderr.on('data', chunk => {
    metricBuffer += chunk.toString();
    let end;
    while ((end = metricBuffer.indexOf('\n')) >= 0) {
      const line = metricBuffer.slice(0, end);
      metricBuffer = metricBuffer.slice(end + 1);
      try { const metric = JSON.parse(line); if (['inference.metrics', 'explorer.tool'].includes(metric.event)) metrics.push(metric); } catch {}
    }
    if (metricBuffer.length > 16000) metricBuffer = '';
  });
  const port = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(Error('START_TIMEOUT')), 10000);
    daemon.once('exit', () => { clearTimeout(timer); reject(Error('DAEMON_EXIT')); });
    daemon.stdout.on('data', bytes => {
      buffer += bytes;
      const line = buffer.split(/\r?\n/).find(value => value.startsWith('{'));
      if (line) { clearTimeout(timer); resolve(JSON.parse(line).port); }
    });
  });
  client = new Client({ name: 'real-repo-acceptance', version: '2.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [host + '/dist/src/runtime/mcp-server.js'], env: { ...env, LOCAL_AGENT_DAEMON_URL: `http://127.0.0.1:${port}` }, stderr: 'pipe' }));

  for (const item of cases) {
    const metricStart = metrics.length;
    const submission = await client.callTool({ name: 'analyze_repo', arguments: {
      schemaVersion: 1,
      repoId: 'novels',
      requestKey: `${runId}-${item.id}`,
      baseRef: targetCommit,
      scope: { allow: item.allow, deny: [] },
      objective: `Read-only acceptance: ${item.id}`,
      question: item.question,
      budget: frozen.budgets,
    } });
    if (submission.isError) throw Error('ADMISSION_FAILED');
    const admitted = submission.structuredContent;
    console.log(JSON.stringify({ stage: 'admitted', case: item.id, taskId: admitted.taskId }));
    const until = Date.now() + 190000;
    let view;
    while (Date.now() < until) {
      const response = await client.callTool({ name: 'get_task', arguments: { schemaVersion: 1, taskId: admitted.taskId } });
      view = response.structuredContent;
      if (['completed', 'failed', 'blocked', 'cancelled', 'budget_exceeded'].includes(view.task.status)) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!view?.task) throw new Error('CASE_TIMEOUT');
    const after = await fingerprint();
    const preservation = {
      head: before.head === after.head,
      status: before.status === after.status,
      index: before.index === after.index,
      trackedContents: JSON.stringify(before.trackedContents) === JSON.stringify(after.trackedContents),
      baselineUntrackedContents: JSON.stringify(before.untrackedContents) === JSON.stringify(after.untrackedContents),
    };
    const result = JSON.parse(view.task.resultJson ?? '{}');
    const caseReview = reviews.cases?.[item.id];
    const evaluation = evaluateAcceptanceCase({ caseId: item.id, taskStatus: view.task.status, result, rubric: rubricById.get(item.rubricRef), review: caseReview, preservation });
    const worksheet = {
      caseId: item.id,
      reviewer: caseReview?.reviewer ?? null,
      reviewedAt: caseReview?.reviewedAt ?? null,
      findings: (result.findings ?? []).map(finding => ({ id: finding.id, statement: finding.statement, status: caseReview?.findingCorrectness?.[finding.id] ?? 'not_reviewed' })),
      requestedFacts: rubricById.get(item.rubricRef).requestedFacts.map(fact => ({ ...fact, status: caseReview?.requestedFactCoverage?.[fact.id] ?? 'not_reviewed' })),
      forbiddenClaims: rubricById.get(item.rubricRef).forbiddenClaims.map(claim => ({ ...claim, status: caseReview?.forbiddenClaims?.[claim.id] ?? 'not_reviewed' })),
      limitationHandling: caseReview?.limitationHandling ?? 'not_reviewed',
    };
    suite.push({ caseId: item.id, rubricRef: item.rubricRef, task: view.task, admission: admitted, preservation, inferenceMetrics: metrics.slice(metricStart), result, worksheet, evaluation });
    await writeReport();
    console.log(JSON.stringify({ profile: label, runId, case: item.id, status: view.task.status, accepted: evaluation.accepted, dimensions: evaluation.dimensions, preservation }));
    if (!Object.values(preservation).every(Boolean)) throw Error('REPOSITORY_CHANGED');
  }
  const report = await writeReport();
  const pairPath = process.env.ACCEPTANCE_PAIR_WITH;
  let pair = null;
  if (pairPath) {
    const previous = JSON.parse(await readFile(pairPath, 'utf8'));
    pair = evaluateGatePair(previous.gateRun, report.gateRun);
    await writeFile(join(dir, `acceptance-pair-${runId}.json`), JSON.stringify({ schemaVersion: 1, firstRunId: previous.gateRun.runId, secondRunId: runId, ...pair }, null, 2));
  }
  console.log(JSON.stringify({ stage: 'complete', reportPath: relative(host, reportPath).replaceAll('\\', '/'), runId, acceptedCases: suite.filter(item => item.evaluation.accepted).length, reviewed: suite.every(item => !Object.values(item.evaluation.dimensions).includes('not_reviewed')), pair }));
} catch (error) {
  console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'ACCEPTANCE_FAILED' }));
  process.exitCode = 1;
} finally {
  await client?.close();
  if (daemon && daemon.exitCode === null) { const ended = once(daemon, 'exit'); daemon.kill(); await ended; }
}
