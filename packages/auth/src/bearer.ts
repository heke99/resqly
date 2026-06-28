/** Extract a Bearer token from an Authorization header value. */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/** Pull the access token from a Headers-like object. */
export function bearerFromHeaders(headers: { get(name: string): string | null }): string | null {
  return parseBearer(headers.get("authorization") ?? headers.get("Authorization"));
}
