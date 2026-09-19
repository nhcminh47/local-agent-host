import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const depth = Number(process.argv[2] ?? 0);
process.send?.({ pid: process.pid });
if (depth < 2) {
  const child = fork(fileURLToPath(import.meta.url), [String(depth + 1)], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  child.on('message', message => process.send?.(message));
}
// Fail-safe for the disposable spike, not production orphan handling.
setTimeout(() => process.exit(0), 30000);
