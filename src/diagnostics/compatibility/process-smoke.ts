import { isProcessAlive } from '../../utils/process.js';
import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';

const exec = promisify(execFile);
const root = fork(fileURLToPath(new URL('./process-fixture.js', import.meta.url)), ['0'], {
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  windowsHide: true,
});
const pids = new Set<number>();
async function terminateTree(pid: number) {
  if (process.platform === 'win32') {
    const executable = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'taskkill.exe');
    await exec(executable, ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
  } else {
    process.kill(-pid, 'SIGKILL');
  }
}
try {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture startup deadline exceeded')), 5000);
    root.on('error', error => { clearTimeout(timer); reject(error); });
    root.on('message', message => {
      if (typeof message === 'object' && message !== null && 'pid' in message && typeof message.pid === 'number') {
        pids.add(message.pid);
        if (pids.size === 3) { clearTimeout(timer); resolve(); }
      }
    });
  });
  assert(root.pid);
  assert.equal(pids.size, 3);
  const start = Date.now();
  await terminateTree(root.pid);
  while ([...pids].some(isProcessAlive) && Date.now() - start < 5000) await delay(50);
  assert.deepEqual([...pids].filter(isProcessAlive), [], 'Fixture descendants must all terminate');
  console.log(JSON.stringify({ status: 'passed', platform: process.platform, processCount: pids.size, terminationMs: Date.now() - start, limitation: 'Live-parent cancellation only; crash orphan handling and Job Objects not implemented' }));
} finally {
  if (root.pid && isProcessAlive(root.pid)) await terminateTree(root.pid).catch(() => undefined);
  if (root.connected) root.disconnect();
}
