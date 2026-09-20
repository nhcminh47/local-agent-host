import { ERROR_CODES } from '../constants/error-codes.js';
const marker = '[REDACTED]';

// Defense in depth, not a complete credential detector. Values are host-provisioned
// in memory; never loaded from repo files, environment scans or model input.
export class SecretFilter {
  readonly #known: readonly string[];
  constructor(knownValues: readonly string[] = []) {
    if (knownValues.length > 128 || knownValues.some(value => !value || value.length > 4096)) throw new Error(ERROR_CODES.INVALID_SECRET_FILTER_CONFIG);
    this.#known = [...new Set(knownValues)];
  }

  filter(text: string) {
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error(ERROR_CODES.SECRET_FILTER_INPUT_LIMIT);
    const ranges: Array<[number, number]> = [];
    for (const value of this.#known) {
      for (let at = text.indexOf(value); at >= 0; at = text.indexOf(value, at + 1)) {
        ranges.push([at, at + value.length]);
        if (ranges.length > 20_000) return { text: text.split('\n').map(() => marker).join('\n'), redacted: true };
      }
    }
    // Scan the complete bounded file before selecting lines or clipping previews.
    for (const match of text.matchAll(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g)) {
      ranges.push([match.index, match.index + match[0].length]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let offset = 0;
    let rangeIndex = 0;
    let redacted = false;
    const lines = text.split('\n').map(line => {
      const start = offset;
      offset += line.length + 1;
      while (rangeIndex < ranges.length && ranges[rangeIndex]![1] <= start) rangeIndex++;
      const range = ranges[rangeIndex];
      const sensitive = (range !== undefined && range[0] < offset && range[1] > start)
        || /\b(?:password|passwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)["']?\s*[:=]\s*\S/i.test(line)
        || /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/i.test(line)
        || /\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{16,}/.test(line)
        || /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i.test(line);
      if (sensitive) { redacted = true; return marker; }
      return line;
    });
    return { text: lines.join('\n'), redacted };
  }

  assertSafeInput(value: unknown): void {
    if (typeof value === 'string' && this.filter(value).redacted) throw new Error(ERROR_CODES.SENSITIVE_INPUT);
    if (Array.isArray(value)) for (const item of value) this.assertSafeInput(item);
    else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) { this.assertSafeInput(key); this.assertSafeInput(item); }
  }

  assertSafeCompletion(value: unknown): void {
    if (typeof value === 'string') {
      if (this.#known.some(secret => value.includes(secret))
        || /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value)
        || /\b(?:password|passwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)["']?\s*[:=]\s*\S/i.test(value)
        || /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/i.test(value)
        || /\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{16,}/.test(value)
        || /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i.test(value)) throw new Error(ERROR_CODES.SENSITIVE_INPUT);
      return;
    }
    if (Array.isArray(value)) for (const item of value) this.assertSafeCompletion(item);
    else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) { this.assertSafeCompletion(key); this.assertSafeCompletion(item); }
  }
}
