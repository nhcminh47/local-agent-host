/** Probe only; this does not establish process ownership or sandboxing. */
export function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
