"use server";

import { revalidatePath } from "next/cache";
import { CreateLeadInput, leads } from "@/modules/leads";
import { fail, ok, type ActionResult } from "../../_lib/action-result";
import { requireSession } from "../../_lib/session";

/** Req. 3: manual lead from the «Новый лид» dialog. */
export async function createLeadAction(raw: unknown): Promise<ActionResult<{ leadId: string }>> {
  const session = await requireSession();
  try {
    const input = CreateLeadInput.parse(raw);
    const { leadId } = await leads.createManualLead(input, session.userId);
    revalidatePath("/leads");
    return ok({ leadId });
  } catch (error) {
    return fail("createLead", error);
  }
}
