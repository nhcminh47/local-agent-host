export function httpOrigin(value: string, invalidMessage: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(invalidMessage);
  }
  return url;
}
