import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const [hostArg, workerArg, marker] = process.argv.slice(2);
if (!hostArg || !workerArg || !marker) process.exit(2);
const host = Number(hostArg), worker = Number(workerArg);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const timer = setInterval(() => {
  if (alive(host)) return;
  clearInterval(timer);
  try {
    if (process.platform === 'win32') execFileSync(join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(worker), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else process.kill(-worker, 'SIGKILL');
    appendFileSync(marker, `guardian-cleaned:${worker}\n`);
    process.exit(0);
  } catch {
    if (!alive(worker)) { appendFileSync(marker, `guardian-cleaned:${worker}\n`); process.exit(0); }
    appendFileSync(marker, `guardian-failed:${worker}\n`); process.exit(1);
  }
}, 50);
