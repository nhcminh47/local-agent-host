/** Match only explicitly allowed errors; callers keep their sanitized fallback. */
export function hasErrorCode(error: unknown, allowed: readonly string[]): error is Error {
  return error instanceof Error && allowed.includes(error.message);
}
