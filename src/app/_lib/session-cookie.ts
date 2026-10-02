// Shared by src/proxy.ts and the session helpers. No server-only imports: the proxy bundles it.
export const SESSION_COOKIE = "lidogram_session";

export const PUBLIC_PATHS = ["/login", "/api/healthz"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

const DEFAULT_PATH = "/leads";
const LOCAL_ORIGIN = "http://lidogram.local";

/**
 * Only same-site relative paths: never redirect to another host after login. Control characters
 * and backslashes are refused outright — URL parsers drop them, so "/\t/evil.com" would become
 * "//evil.com".
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return DEFAULT_PATH;
  let url: URL;
  try {
    url = new URL(next, LOCAL_ORIGIN);
  } catch {
    return DEFAULT_PATH;
  }
  if (url.origin !== LOCAL_ORIGIN || isPublicPath(url.pathname)) return DEFAULT_PATH;
  return `${url.pathname}${url.search}`;
}
