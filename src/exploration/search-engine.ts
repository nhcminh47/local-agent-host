import { z } from 'zod';
import type { ReadTools } from './read-tools.js';
import type { LineMatcher } from './search-backends.js';

export const SearchCodeInput = z.object({
  schemaVersion: z.literal(1),
  repoId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  pattern: z.string().min(1).max(256).refine(value => !/[\r\n\0]/.test(value) && Buffer.from(value).toString('utf8') === value),
  maxMatches: z.number().int().min(1).max(100).default(100),
}).strict();

export async function searchFiles(tools: ReadTools, raw: unknown, backend: 'node' | 'ripgrep', matcher: LineMatcher, signal = new AbortController().signal) {
  const input = SearchCodeInput.parse(raw);
  if (tools.secrets.filter(input.pattern).redacted) throw new Error('SENSITIVE_SEARCH_PATTERN');
  signal.throwIfAborted();
  const deadline = AbortSignal.timeout(4_000);
  const combined = AbortSignal.any([signal, deadline]);
  const matches: Array<{ path: string; line: number; preview: string }> = [];
  let scannedBytes = 0;
  let outputBytes = 0;
  let skippedFiles = 0;
  let redactedFiles = 0;
  let reason: string | null = null;
  try {
    const listing = await tools.listFiles(input.repoId, '', 500, combined);
    for (const path of listing.files) {
      combined.throwIfAborted();
      let file;
      try { file = await tools.readSearchText(input.repoId, path); }
      catch (error) {
        if (error instanceof Error && ['PATH_DENIED', 'FILE_NOT_READABLE', 'BINARY_FILE', 'INVALID_UTF8'].includes(error.message) || ['ENOENT', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) { skippedFiles++; continue; }
        throw error;
      }
      scannedBytes += file.bytes;
      if (file.redacted) redactedFiles++;
      if (scannedBytes > 8 * 1024 * 1024) { reason = 'BYTE_LIMIT'; break; }
      const lines = file.text.split('\n');
      const found = await matcher(file.text, input.pattern, input.maxMatches - matches.length + 1, combined);
      for (const line of found) {
        if (matches.length === input.maxMatches) { reason = 'MATCH_LIMIT'; break; }
        const match = { path, line, preview: (lines[line - 1] ?? '').slice(0, 500) };
        const size = Buffer.byteLength(JSON.stringify(match));
        if (outputBytes + size > 48 * 1024) { reason = 'OUTPUT_LIMIT'; break; }
        outputBytes += size;
        matches.push(match);
      }
      if (reason) break;
    }
    if (!reason && listing.truncated) reason = 'FILE_LIMIT';
    if (!reason && skippedFiles) reason = 'SKIPPED_FILES';
  } catch (error) {
    if (signal.aborted) throw new Error('SEARCH_CANCELLED');
    if (deadline.aborted || error instanceof Error && ['SEARCH_TIMEOUT', 'SEARCH_OUTPUT_LIMIT', 'LIST_LIMIT'].includes(error.message)) reason = deadline.aborted ? 'TIME_LIMIT' : (error as Error).message;
    else throw error;
  }
  signal.throwIfAborted();
  return { backend, matches, truncated: reason !== null, reason, skippedFiles, redactedFiles, ...(tools.provenance ? { snapshot: tools.provenance } : {}) };
}
