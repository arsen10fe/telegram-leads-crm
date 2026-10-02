// UI copy of the tag palette (client components must not import modules at runtime).
// tag-colors.test.ts keeps it in sync with TAG_COLORS in the leads module.

export const TAG_COLOR_CLASSES = {
  slate: { badge: "border-slate-200 bg-slate-100 text-slate-700", dot: "bg-slate-500", label: "Серый" },
  red: { badge: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500", label: "Красный" },
  orange: { badge: "border-orange-200 bg-orange-50 text-orange-700", dot: "bg-orange-500", label: "Оранжевый" },
  amber: { badge: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500", label: "Жёлтый" },
  green: { badge: "border-green-200 bg-green-50 text-green-700", dot: "bg-green-500", label: "Зелёный" },
  teal: { badge: "border-teal-200 bg-teal-50 text-teal-700", dot: "bg-teal-500", label: "Бирюзовый" },
  sky: { badge: "border-sky-200 bg-sky-50 text-sky-700", dot: "bg-sky-500", label: "Голубой" },
  blue: { badge: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500", label: "Синий" },
  violet: { badge: "border-violet-200 bg-violet-50 text-violet-700", dot: "bg-violet-500", label: "Фиолетовый" },
  pink: { badge: "border-pink-200 bg-pink-50 text-pink-700", dot: "bg-pink-500", label: "Розовый" },
} as const;

export type UiTagColor = keyof typeof TAG_COLOR_CLASSES;

export const UI_TAG_COLORS = Object.keys(TAG_COLOR_CLASSES) as UiTagColor[];

export function tagColorClasses(color: string) {
  return TAG_COLOR_CLASSES[color as UiTagColor] ?? TAG_COLOR_CLASSES.slate;
}
