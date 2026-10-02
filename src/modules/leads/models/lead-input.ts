import { z } from "zod";
import { AI_MODES } from "@/modules/settings";
import { LEAD_CONTACT_MAX_LENGTH, LEAD_NAME_MAX_LENGTH, LEAD_REQUEST_MAX_LENGTH } from "./lead";
import { TAG_COLORS, TAG_NAME_MAX_LENGTH, normalizeTagName } from "./tag";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : undefined));

const leadName = z
  .string()
  .trim()
  .min(2, "Имя — минимум 2 символа")
  .max(LEAD_NAME_MAX_LENGTH, `Имя — не длиннее ${LEAD_NAME_MAX_LENGTH} символов`);

/** Manual lead form (req. 3). */
export const CreateLeadInput = z.object({
  name: leadName,
  contact: optionalText(LEAD_CONTACT_MAX_LENGTH, `Контакт — не длиннее ${LEAD_CONTACT_MAX_LENGTH} символов`),
  request: optionalText(LEAD_REQUEST_MAX_LENGTH, `Запрос — не длиннее ${LEAD_REQUEST_MAX_LENGTH} символов`),
  tagIds: z.array(z.string().min(1)).max(20, "Не больше 20 тегов").default([]),
});
export type CreateLeadInput = z.input<typeof CreateLeadInput>;

export const UpdateLeadFieldsInput = z.object({
  name: leadName.optional(),
  contact: z.string().trim().max(LEAD_CONTACT_MAX_LENGTH).optional(),
  request: z.string().trim().max(LEAD_REQUEST_MAX_LENGTH).optional(),
});
export type UpdateLeadFieldsInput = z.input<typeof UpdateLeadFieldsInput>;

export const AiModeInput = z.enum(AI_MODES);

const tagName = z
  .string()
  .transform(normalizeTagName)
  .pipe(
    z
      .string()
      .min(1, "Введите название тега")
      .max(TAG_NAME_MAX_LENGTH, `Название — не длиннее ${TAG_NAME_MAX_LENGTH} символов`),
  );

export const TagInput = z.object({
  name: tagName,
  color: z.enum(TAG_COLORS).default("slate"),
});
export type TagInput = z.input<typeof TagInput>;

// No defaults here: a rename must not reset the color.
export const TagUpdateInput = z.object({
  name: tagName.optional(),
  color: z.enum(TAG_COLORS).optional(),
});
export type TagUpdateInput = z.input<typeof TagUpdateInput>;
