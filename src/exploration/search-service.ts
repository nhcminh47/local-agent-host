import { ERROR_CODES } from '../constants/error-codes.js';
import { CapabilityService } from './capability-service.js';
import { ReadTools } from './read-tools.js';
import { matchBuiltin, ripgrepMatcher } from './search-backends.js';
import { SearchCodeInput, searchFiles } from './search-engine.js';

// Internal dispatcher for the future explorer loop; registration stays host-owned.
export class SearchService {
  constructor(readonly tools: ReadTools, readonly capabilities: CapabilityService) {}
  async search(raw: unknown, signal = new AbortController().signal) {
    const input = SearchCodeInput.parse(raw);
    this.tools.repos.root(input.repoId);
    signal.throwIfAborted();
    const capability = await this.capabilities.check({ schemaVersion: 1, capability: 'ripgrep' });
    if (capability.status === 'blocked') return capability;
    const backend = capability.backend === 'node' ? 'node' : 'ripgrep';
    try {
      return { schemaVersion: 1, status: 'completed', ...await searchFiles(this.tools, input, backend, backend === 'node' ? matchBuiltin : ripgrepMatcher(await this.capabilities.ripgrepExecutable()), signal) };
    } catch (error) {
      if (error instanceof Error && error.message === ERROR_CODES.RIPGREP_UNAVAILABLE) {
        this.capabilities.invalidate();
        return { schemaVersion: 1, status: 'blocked', reason: ERROR_CODES.MISSING_CAPABILITY, requiredAction: { capability: 'ripgrep', choices: ['install', 'use_builtin_fallback', 'cancel'] } };
      }
      throw error;
    }
  }
}
