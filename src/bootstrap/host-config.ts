import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { HostConfig, type HostConfigValue } from '../domain/host-config-contracts.js';
import { atomicPrivateWrite, readPrivateText, userStateDir } from './user-state.js';

export async function readHostConfig(): Promise<HostConfigValue | null> {
  const text = await readPrivateText(join(userStateDir(), 'config.json'));
  return text === null ? null : HostConfig.parse(JSON.parse(text));
}

export async function writeHostConfig(config: HostConfigValue): Promise<void> {
  await atomicPrivateWrite(join(userStateDir(), 'config.json'), `${JSON.stringify(HostConfig.parse(config), null, 2)}\n`);
}

export async function readHostToken(): Promise<string | null> {
  const text = await readPrivateText(join(userStateDir(), 'ipc-token'));
  const token = text?.trim() ?? null;
  if (token !== null && !/^[a-f0-9]{64}$/.test(token)) throw new Error('INVALID_HOST_TOKEN');
  return token;
}

export async function ensureHostToken(): Promise<string> {
  const existing = await readHostToken();
  if (existing) return existing;
  const token = randomBytes(32).toString('hex');
  await atomicPrivateWrite(join(userStateDir(), 'ipc-token'), `${token}\n`);
  return token;
}

export async function readManagementToken(): Promise<string | null> {
  const text = await readPrivateText(join(userStateDir(), 'management-token'));
  const token = text?.trim() ?? null;
  if (token !== null && !/^[a-f0-9]{64}$/.test(token)) throw new Error('INVALID_MANAGEMENT_TOKEN');
  return token;
}

export async function ensureManagementToken(): Promise<string> {
  const existing = await readManagementToken();
  if (existing) return existing;
  const token = randomBytes(32).toString('hex');
  await atomicPrivateWrite(join(userStateDir(), 'management-token'), `${token}\n`);
  return token;
}
