/** Escape for parse_mode HTML. */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * A client-provided value for an HTML message: one line (line breaks would let a client fake extra
 * lines, e.g. a phishing link, in the agency's own notification), truncated BEFORE escaping so an
 * entity like &amp; is never cut in half.
 */
export function safe(value: string | null | undefined, max = 300): string {
  const oneLine = (value ?? "").replace(/\s+/g, " ").trim();
  return escapeHtml(truncate(oneLine || "—", max));
}
