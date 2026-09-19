import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const exec = promisify(execFile);
const argument = process.argv[2];
if (!argument) throw new Error('Supply the local repo path');
const repo = await realpath(resolve(argument));
const git = async (args: string[]) => (await exec('git', ['-C', repo, ...args], { windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024 })).stdout;
const top = (await git(['rev-parse', '--show-toplevel'])).trim();
const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
const dirty = (await git(['status', '--porcelain=v1', '-z'])).length > 0;
const tracked = (await git(['ls-files', '-z'])).split('\0').filter(Boolean);
const conventions = tracked.filter(path => /(^|\/)(AGENTS\.md|CONTRIBUTING[^/]*|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|package-lock\.json)$/.test(path) || path.startsWith('.github/workflows/'));
let packageSummary: unknown = null;
try {
  const data = JSON.parse(await readFile(join(top, 'package.json'), 'utf8'));
  packageSummary = { packageManager: typeof data.packageManager === 'string' ? data.packageManager : null, scriptNames: Object.keys(data.scripts ?? {}) };
} catch { /* Non-Node repositories are valid discovery inputs. */ }
console.log(JSON.stringify({ schemaVersion: 1, head, dirty, package: packageSummary, conventionFiles: conventions.slice(0, 200), truncated: conventions.length > 200, limitation: 'Tracked convention paths and root manifest only; review nested and untracked instructions locally before execution' }, null, 2));
