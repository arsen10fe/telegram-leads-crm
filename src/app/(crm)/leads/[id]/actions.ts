"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ai } from "@/modules/ai";
import { channels, MAX_OUTBOUND_LENGTH, type SendFailure } from "@/modules/channels";
import { AiModeInput, leads, pickTagColor, UpdateLeadFieldsInput } from "@/modules/leads";
import { createLogger } from "@/shared/logger";
import { fail, ok, type ActionResult } from "../../../_lib/action-result";
import { createRateLimiter } from "../../../_lib/rate-limit";
import { requireSession } from "../../../_lib/session";

const log = createLogger("web.lead");

// The demo login is public: cap what costs money (OpenAI) or reaches real people (Telegram).
const suggestLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
const sendLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function rateLimited(action: string, userId: string): ActionResult<never> {
  log.warn({ action, userId }, "action rate limited");
  return { ok: false, error: { code: "rate_limited", message: "Слишком часто. Подождите минуту." } };
}

const SEND_FAILURE_MESSAGES: Record<SendFailure, string> = {
  no_channel: "У лида нет канала связи",
  business_window_closed:
    "Прошло больше 24 часов с последнего сообщения клиента — Telegram не даёт ответить от имени аккаунта",
  blocked: "Клиент заблокировал бота",
  rejected: "Telegram отклонил сообщение",
  network: "Нет связи с Telegram. Попробуйте ещё раз",
  too_long: `Сообщение длиннее ${MAX_OUTBOUND_LENGTH} символов`,
  empty: "Пустое сообщение",
};

const SendReplyInput = z.object({
  leadId: z.string().min(1).max(64),
  text: z.string().trim().min(1, "Пустое сообщение").max(MAX_OUTBOUND_LENGTH, SEND_FAILURE_MESSAGES.too_long),
});

/** The manager's reply from the lead card. A sent reply also means the lead is handled. */
export async function sendReplyAction(raw: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (!sendLimiter.take(session.userId)) return rateLimited("sendReply", session.userId);
  try {
    const { leadId, text } = SendReplyInput.parse(raw);
    const result = await channels.sendToLead({ leadId, text, author: "manager", actorId: session.userId });
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    if (!result.ok) {
      log.warn({ action: "sendReply", leadId, code: result.reason }, "reply not delivered");
      return { ok: false, error: { code: result.reason, message: SEND_FAILURE_MESSAGES[result.reason] } };
    }
    await leads.markHandled(leadId);
    return ok(null);
  } catch (error) {
    return fail("sendReply", error);
  }
}

const Id = z.string().min(1).max(64);
const LeadTagInput = z.object({ leadId: Id, tagId: Id });

function revalidateLead(leadId: string, alsoTags = false): void {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  if (alsoTags) revalidatePath("/tags");
}

const SUGGEST_FAILURE_MESSAGES = {
  ai_disabled: "AI выключен",
  ai_failed: "Не получилось — напишите ответ вручную",
  client_wrote_again: "Клиент написал ещё, пока AI думал — предложите ответ снова",
  not_found: "Лид не найден",
} as const;

/** Copilot: «✨ Предложить ответ» and «Ещё вариант». The new draft replaces the previous one. */
export async function suggestReplyAction(
  leadId: string,
): Promise<ActionResult<{ id: string; text: string; noteForManager: string | null }>> {
  const session = await requireSession();
  if (!suggestLimiter.take(session.userId)) return rateLimited("suggestReply", session.userId);
  try {
    const id = Id.parse(leadId);
    const result = await ai.suggestReply(id);
    if (!result.ok) {
      log.warn({ action: "suggestReply", leadId: id, code: result.reason }, "suggest failed");
      return { ok: false, error: { code: result.reason, message: SUGGEST_FAILURE_MESSAGES[result.reason] } };
    }
    revalidatePath(`/leads/${id}`);
    return ok({ id: result.draft.id, text: result.draft.text, noteForManager: result.draft.noteForManager });
  } catch (error) {
    return fail("suggestReply", error, { leadId });
  }
}

const SendDraftInput = z.object({
  draftId: Id,
  text: z.string().trim().min(1, "Пустое сообщение").max(MAX_OUTBOUND_LENGTH, SEND_FAILURE_MESSAGES.too_long),
});

/**
 * Sends a (possibly edited) draft. The claim is atomic, so a double click or two managers can
 * never send it twice; a failed delivery puts the draft back.
 */
export async function sendDraftAction(raw: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (!sendLimiter.take(session.userId)) return rateLimited("sendDraft", session.userId);
  try {
    const { draftId, text } = SendDraftInput.parse(raw);
    const draft = await leads.claimDraft({ draftId, actorId: session.userId });
    if (!draft) {
      return { ok: false, error: { code: "already_handled", message: "Черновик уже отправлен или устарел" } };
    }
    const edited = text !== draft.text;
    const result = await channels.sendToLead({
      leadId: draft.leadId,
      text,
      author: "manager",
      actorId: session.userId,
      meta: { draftId, edited },
    });
    revalidatePath(`/leads/${draft.leadId}`);
    revalidatePath("/leads");
    if (!result.ok) {
      await leads.releaseDraft({ draftId });
      log.warn({ action: "sendDraft", leadId: draft.leadId, code: result.reason }, "draft not delivered");
      return { ok: false, error: { code: result.reason, message: SEND_FAILURE_MESSAGES[result.reason] } };
    }
    await leads.markHandled(draft.leadId);
    log.info({ draftId, edited }, "draft sent");
    return ok(null);
  } catch (error) {
    return fail("sendDraft", error);
  }
}

export async function rejectDraftAction(raw: unknown): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const { leadId, draftId } = z.object({ leadId: Id, draftId: Id }).parse(raw);
    await leads.rejectDraft({ draftId, actorId: session.userId });
    revalidatePath(`/leads/${leadId}`);
    return ok(null);
  } catch (error) {
    return fail("rejectDraft", error);
  }
}

export async function updateLeadAction(leadId: string, raw: unknown): Promise<ActionResult> {
  await requireSession();
  try {
    const input = UpdateLeadFieldsInput.parse(raw);
    await leads.updateLeadFields(Id.parse(leadId), input);
    revalidateLead(leadId);
    return ok(null);
  } catch (error) {
    return fail("updateLead", error, { leadId });
  }
}

export async function assignTagAction(raw: unknown): Promise<ActionResult> {
  await requireSession();
  try {
    const { leadId, tagId } = LeadTagInput.parse(raw);
    await leads.assignTag({ leadId, tagId, origin: "manual" });
    revalidateLead(leadId, true);
    return ok(null);
  } catch (error) {
    return fail("assignTag", error);
  }
}

export async function removeTagAction(raw: unknown): Promise<ActionResult> {
  await requireSession();
  try {
    const { leadId, tagId } = LeadTagInput.parse(raw);
    await leads.removeTag({ leadId, tagId });
    revalidateLead(leadId, true);
    return ok(null);
  } catch (error) {
    return fail("removeTag", error);
  }
}

/** «Создать тег» in the tag picker: reuses an existing tag with the same name. */
export async function createTagAndAssignAction(raw: unknown): Promise<ActionResult<{ tagId: string }>> {
  await requireSession();
  try {
    const { leadId, name } = z.object({ leadId: Id, name: z.string() }).parse(raw);
    const tag = await leads.findOrCreateTag({ name, color: pickTagColor(name) });
    await leads.assignTag({ leadId, tagId: tag.id, origin: "manual" });
    revalidateLead(leadId, true);
    return ok({ tagId: tag.id });
  } catch (error) {
    return fail("createTagAndAssign", error);
  }
}

export async function setAiModeAction(raw: unknown): Promise<ActionResult> {
  await requireSession();
  try {
    const { leadId, mode } = z.object({ leadId: Id, mode: AiModeInput }).parse(raw);
    await leads.setAiMode(leadId, mode);
    revalidateLead(leadId);
    return ok(null);
  } catch (error) {
    return fail("setAiMode", error);
  }
}

export async function markHandledAction(leadId: string): Promise<ActionResult> {
  await requireSession();
  try {
    await leads.markHandled(Id.parse(leadId));
    revalidateLead(leadId);
    return ok(null);
  } catch (error) {
    return fail("markHandled", error, { leadId });
  }
}
