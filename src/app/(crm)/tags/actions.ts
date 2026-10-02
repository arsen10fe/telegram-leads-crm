"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { leads, TagInput, TagUpdateInput } from "@/modules/leads";
import { fail, ok, type ActionResult } from "../../_lib/action-result";
import { requireSession } from "../../_lib/session";

const Id = z.string().min(1).max(64);

function revalidateTags(): void {
  revalidatePath("/tags");
  revalidatePath("/leads");
}

export async function createTagAction(raw: unknown): Promise<ActionResult<{ tagId: string }>> {
  await requireSession();
  try {
    const tag = await leads.createTag(TagInput.parse(raw));
    revalidateTags();
    return ok({ tagId: tag.id });
  } catch (error) {
    return fail("createTag", error);
  }
}

export async function updateTagAction(tagId: string, raw: unknown): Promise<ActionResult> {
  await requireSession();
  try {
    await leads.updateTag(Id.parse(tagId), TagUpdateInput.parse(raw));
    revalidateTags();
    return ok(null);
  } catch (error) {
    return fail("updateTag", error, { tagId });
  }
}

export async function deleteTagAction(tagId: string): Promise<ActionResult<{ affectedLeads: number }>> {
  await requireSession();
  try {
    const result = await leads.deleteTag(Id.parse(tagId));
    revalidateTags();
    return ok(result);
  } catch (error) {
    return fail("deleteTag", error, { tagId });
  }
}
