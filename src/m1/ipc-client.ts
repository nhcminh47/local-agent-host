import { z } from 'zod';

const IpcEnvelope = z.object({ ok: z.boolean(), value: z.unknown().optional(), error: z.string().optional() }).strict();

export class DaemonClient {
  readonly #origin: URL;
  readonly #token: string;
  constructor(origin: string, token: string) {
    this.#origin = new URL(origin);
    if (this.#origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(this.#origin.hostname) || this.#origin.username || this.#origin.password || this.#origin.pathname !== '/') throw new Error('INVALID_DAEMON_ORIGIN');
    if (token.length < 32) throw new Error('INVALID_DAEMON_TOKEN');
    this.#token = token;
  }
  async call(path: 'submit' | 'get' | 'cancel' | 'check-capability' | 'resolve-capability', body: unknown): Promise<unknown> {
    const response = await fetch(new URL(`/v1/${path}`, this.#origin), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.#token}` }, body: JSON.stringify(body) });
    const envelope = IpcEnvelope.parse(await response.json());
    if (!response.ok || !envelope.ok) throw new Error(envelope.error ?? 'DAEMON_ERROR');
    return envelope.value;
  }
}
