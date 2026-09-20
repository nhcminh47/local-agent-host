import { ERROR_CODES } from '../constants/error-codes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded), 'Cache-Control': 'no-store' });
  response.end(encoded);
}
export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  // Preserve the socket on overflow so the daemon can send its 413 response.
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 65_536) throw new Error(ERROR_CODES.REQUEST_TOO_LARGE);
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
