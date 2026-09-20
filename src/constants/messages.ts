export const MESSAGES = {
  INVALID_HTTP_ORIGIN: 'Use an HTTP(S) origin without credentials, path, query or fragment',
  IPC_TOKEN_REQUIRED: 'LOCAL_AGENT_IPC_TOKEN is required',
  IPC_TOKEN_TOO_SHORT: 'LOCAL_AGENT_IPC_TOKEN must contain at least 32 characters',
} as const;
