import { db } from "@/shared/db";
import { AppError, isUniqueViolation } from "@/shared/errors";
import { createLogger } from "@/shared/logger";
import { TagInput, TagUpdateInput } from "../models/lead-input";
import { toTagView, type TagView, type TagWithCount } from "../models/lead-view";
import { tagNameKey } from "../models/tag";
import { tagRepository } from "../repositories/tag-repository";

const log = createLogger("leads.tags");

// Sorted in code: database collations differ (macOS libc mis-sorts Cyrillic, musl sorts by bytes).
const tagNameCollator = new Intl.Collator("ru", { sensitivity: "base", numeric: true });

function byName<T extends { name: string }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => tagNameCollator.compare(a.name, b.name));
}

function tagExists(name: string): AppError {
  return new AppError("tag_exists", `Тег «${name}» уже есть`, 409);
}

export async function listTags(): Promise<TagView[]> {
  const tags = await tagRepository.listAll(db);
  return byName(tags.map(toTagView));
}

export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  const tags = await tagRepository.listWithCounts(db);
  return byName(tags.map((tag) => ({ ...toTagView(tag), leadCount: tag._count.leads })));
}

/** Names are unique case-insensitively («Тёплый» = «теплый»); the database enforces it. */
export async function createTag(input: TagInput): Promise<TagView> {
  const { name, color } = TagInput.parse(input);
  try {
    const tag = await tagRepository.create(db, { name, nameKey: tagNameKey(name), color });
    log.info({ tagId: tag.id }, "tag created");
    return toTagView(tag);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    log.warn({ name }, "tag name conflict");
    throw tagExists(name);
  }
}

/** For «создать тег» in the lead card: an existing tag with the same name is reused. */
export async function findOrCreateTag(input: TagInput): Promise<TagView> {
  const { name } = TagInput.parse(input);
  const existing = await tagRepository.findByNameKey(db, tagNameKey(name));
  if (existing) return toTagView(existing);
  try {
    return await createTag(input);
  } catch (error) {
    // Lost a race with another manager creating the same tag.
    const raced = await tagRepository.findByNameKey(db, tagNameKey(name));
    if (raced) return toTagView(raced);
    throw error;
  }
}

export async function updateTag(tagId: string, input: TagUpdateInput): Promise<TagView> {
  const patch = TagUpdateInput.parse(input);
  const data = {
    ...(patch.name ? { name: patch.name, nameKey: tagNameKey(patch.name) } : {}),
    ...(patch.color ? { color: patch.color } : {}),
  };
  try {
    const tag = await tagRepository.update(db, tagId, data);
    log.info({ tagId, fields: Object.keys(data) }, "tag updated");
    return toTagView(tag);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    log.warn({ name: patch.name }, "tag name conflict");
    throw tagExists(patch.name ?? "");
  }
}

/** Removes the tag and all its assignments. Returns how many leads lost it. */
export async function deleteTag(tagId: string): Promise<{ affectedLeads: number }> {
  const affectedLeads = await tagRepository.countLeads(db, tagId);
  await tagRepository.delete(db, tagId);
  log.info({ tagId, affectedLeads }, "tag deleted");
  return { affectedLeads };
}
