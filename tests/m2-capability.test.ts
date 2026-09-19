import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityService, ResolveCapabilityInput } from '../src/exploration/capability-service.js';
import { CapabilityRegistry } from '../src/exploration/capabilities.js';

const check = { schemaVersion: 1, capability: 'ripgrep' };
const missing = 'agent-test-missing-ripgrep';

test('capability decisions survive restart, while cancel does not change host preference', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-capability-'));
  let service = new CapabilityService(join(dir, 'state.db'), missing);
  try {
    assert.equal((await service.check(check)).status, 'blocked');
    assert.equal((await service.resolve({ ...check, decision: 'cancel' })).status, 'cancelled');
    assert.equal((await service.check(check)).status, 'blocked');
    const fallback = await service.resolve({ ...check, decision: 'use_builtin_fallback' });
    assert('backend' in fallback);
    assert.equal(fallback.backend, 'node');
    service.close();
    service = new CapabilityService(join(dir, 'state.db'), missing);
    assert.deepEqual(await service.check(check), fallback);
    await service.resolve({ ...check, decision: 'cancel' });
    assert.deepEqual(await service.check(check), fallback);
    const install = await service.resolve({ ...check, decision: 'install' });
    assert('reason' in install);
    assert.equal(install.reason, 'HOST_INSTALLER_UNAVAILABLE');
    assert.deepEqual(await service.check(check), fallback);
  } finally { service.close(); await rm(dir, { recursive: true, force: true }); }
});

test('capability contracts reject executable, commands and unknown decisions', () => {
  for (const extra of [{ executable: 'evil' }, { command: 'evil' }, { decision: 'automatic_install' }, { capability: 'shell' }]) {
    assert.equal(ResolveCapabilityInput.safeParse({ ...check, decision: 'install', ...extra }).success, false);
  }
});

test('capability preflight cache is keyed by executable and clear invalidates it', async () => {
  const registry = new CapabilityRegistry();
  const first = registry.ripgrep(missing);
  assert.equal(registry.ripgrep(missing), first);
  assert.notEqual(registry.ripgrep(process.execPath), first);
  assert.equal((await registry.ripgrep(process.execPath)).status, 'missing');
  await first;
  registry.clear();
  assert.notEqual(registry.ripgrep(missing), first);
  await registry.ripgrep(missing);
});
