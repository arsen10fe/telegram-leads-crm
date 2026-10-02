/** Tag colors are palette keys; the CRM maps them to badge styles. */
export const TAG_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "sky",
  "blue",
  "violet",
  "pink",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const DEFAULT_TAG_COLOR: TagColor = "slate";
export const TAG_NAME_MAX_LENGTH = 40;

export function isTagColor(value: string): value is TagColor {
  return (TAG_COLORS as readonly string[]).includes(value);
}

/** Display form: trimmed, inner whitespace collapsed. */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Uniqueness key: «Тёплый», «теплый » and «ТЕПЛЫЙ» are the same tag. */
export function tagNameKey(name: string): string {
  return normalizeTagName(name).toLowerCase().replaceAll("ё", "е");
}

/** A stable color for a tag created on the fly: the same name always gets the same color. */
export function pickTagColor(name: string): TagColor {
  let hash = 0;
  for (const char of tagNameKey(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length] ?? DEFAULT_TAG_COLOR;
}
