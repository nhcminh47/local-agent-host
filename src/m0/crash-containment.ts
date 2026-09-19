import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const dir = await mkdtemp(join(tmpdir(), 'agent-crash-m0-'));
const marker = join(dir, 'events.txt');
const host = fork(fileURLToPath(new URL('./crash-host.js', import.meta.url)), [marker], { stdio: ['ignore','ignore','ignore','ipc'], windowsHide: true });
const info = await new Promise<{workerPid:number;guardianPid:number}>((resolve, reject) => { const timer=setTimeout(()=>reject(new Error('startup timeout')),5000); host.once('message', value=>{clearTimeout(timer);resolve(value as {workerPid:number;guardianPid:number});}); });
const alive = (pid:number) => { try { process.kill(pid,0); return true; } catch { return false; } };
try {
  const start = Date.now();
  host.kill('SIGKILL');
  await new Promise<void>(resolve => host.once('exit', () => resolve()));
  let events = '';
  while (Date.now()-start < 8000) {
    try { events = await readFile(marker,'utf8'); } catch { /* guardian has not written yet */ }
    if (!alive(info.workerPid) && events.includes(`guardian-cleaned:${info.workerPid}`)) break;
    await delay(50);
  }
  assert(!alive(info.workerPid), 'worker survived host crash');
  assert(events.includes(`guardian-cleaned:${info.workerPid}`), 'guardian did not record cleanup');
  console.log(JSON.stringify({status:'passed',platform:process.platform,cleanupMs:Date.now()-start,workerPid:info.workerPid,limitation:'Independent polling guardian; production must add task identity, PID-start-time validation, durable receipt and guardian recovery'}));
} finally {
  if (alive(info.workerPid)) process.kill(info.workerPid,'SIGKILL');
  if (alive(info.guardianPid)) process.kill(info.guardianPid,'SIGKILL');
  await rm(dir,{recursive:true,force:true});
}
