import { isProcessAlive } from '../../utils/process.js';
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const [hostArg, workerArg, marker] = process.argv.slice(2);
if (!hostArg || !workerArg || !marker) process.exit(2);
const host = Number(hostArg), worker = Number(workerArg);
const timer = setInterval(() => {
  if (isProcessAlive(host)) return;
  clearInterval(timer);
  try {
    if (process.platform === 'win32') execFileSync(join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(worker), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else process.kill(-worker, 'SIGKILL');
    appendFileSync(marker, `guardian-cleaned:${worker}\n`);
    process.exit(0);
  } catch {
    if (!isProcessAlive(worker)) { appendFileSync(marker, `guardian-cleaned:${worker}\n`); process.exit(0); }
    appendFileSync(marker, `guardian-failed:${worker}\n`); process.exit(1);
  }
}, 50);
