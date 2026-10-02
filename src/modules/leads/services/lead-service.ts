import type { AiModeValue } from "@/modules/settings";
import { db } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { enqueue } from "@/shared/jobs";
import { createLogger } from "@/shared/logger";
import { parseContact } from "../models/contact";
import { parseChannelKey } from "../models/lead";
import { AiModeInput, CreateLeadInput, UpdateLeadFieldsInput } from "../models/lead-input";
import { toLeadDetails, toLeadListItem, type LeadDetails, type LeadListItem } from "../models/lead-view";
import { leadRepository, type LeadListFilters } from "../repositories/lead-repository";
import { leadTagRepository } from "../repositories/lead-tag-repository";
import { tagRepository } from "../repositories/tag-repository";

const log = createLogger("leads");

function leadNotFound(): AppError {
  return new AppError("lead_not_found", "Лид не найден", 404);
}

/** A typed contact becomes normalized (+7…, @username, e-mail); anything else is kept as typed. */
function contactFields(raw: string | undefined) {
  if (!raw) return { contact: null, contactType: null, telegramUsername: null };
  const parsed = parseContact(raw);
  return {
    contact: parsed?.value ?? raw,
    contactType: parsed?.type ?? null,
    telegramUsername: parsed?.type === "telegram" ? parsed.value.slice(1) : null,
  };
}

/** A bot or Business lead keeps the Telegram username it came with. */
function contactPatch(raw: string, keepTelegramUsername: boolean) {
  const fields = contactFields(raw || undefined);
  if (!keepTelegramUsername) return fields;
  return { contact: fields.contact, contactType: fields.contactType };
}

/** Req. 3: a lead added by hand. Lead + tags + AI qualification job commit together. */
export async function createManualLead(input: CreateLeadInput, actorId: string | null): Promise<{ leadId: string }> {
  const parsed = CreateLeadInput.parse(input);
  const now = new Date();

  const { lead, tagCount } = await db.$transaction(async (tx) => {
    const tags = parsed.tagIds.length > 0 ? await tagRepository.findManyByIds(tx, parsed.tagIds) : [];
    const created = await leadRepository.create(tx, {
      name: parsed.name,
      ...contactFields(parsed.contact),
      request: parsed.request ?? null,
      source: "manual",
      channelKey: null,
      telegramChatId: null,
      telegramUserId: null,
      aiMode: "off",
      aiStatus: "pending",
      lastInboundAt: null,
      lastActivityAt: now,
      createdById: actorId,
    });
    for (const tag of tags) {
      await leadTagRepository.assign(tx, { leadId: created.id, tagId: tag.id, origin: "manual" });
    }
    await enqueue(tx, "qualify_lead", { leadId: created.id });
    return { lead: created, tagCount: tags.length };
  });

  if (tagCount < parsed.tagIds.length) {
    log.warn({ leadId: lead.id, requested: parsed.tagIds.length, found: tagCount }, "unknown tag ids ignored");
  }
  log.info({ leadId: lead.id, source: "manual", tagCount, actorId }, "lead created");
  return { leadId: lead.id };
}

export async function listLeads(filters: LeadListFilters = {}): Promise<LeadListItem[]> {
  const startedAt = Date.now();
  const rows = await leadRepository.list(db, filters);
  log.debug({ filters, count: rows.length, ms: Date.now() - startedAt }, "leads listed");
  return rows.map(toLeadListItem);
}

/** All leads matching the filters; the list itself stops at 100, so the page can say so. */
export async function countLeads(filters: LeadListFilters = {}): Promise<number> {
  return leadRepository.count(db, filters);
}

export async function getLeadDetails(leadId: string): Promise<LeadDetails | null> {
  const row = await leadRepository.findDetailsById(db, leadId);
  return row ? toLeadDetails(row) : null;
}

export async function updateLeadFields(leadId: string, input: UpdateLeadFieldsInput): Promise<void> {
  const patch = UpdateLeadFieldsInput.parse(input);
  const existing = await leadRepository.findById(db, leadId);
  if (!existing) throw leadNotFound();

  await leadRepository.update(db, leadId, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.contact !== undefined ? contactPatch(patch.contact, existing.channelKey !== null) : {}),
    ...(patch.request !== undefined ? { request: patch.request || null } : {}),
  });
  log.info({ leadId, fields: Object.keys(patch) }, "lead fields updated");
}

/** Switching to autopilot clears «needs human»: the manager hands the dialog back to the AI. */
export async function setAiMode(leadId: string, mode: AiModeValue): Promise<void> {
  const nextMode = AiModeInput.parse(mode);
  const lead = await leadRepository.findById(db, leadId);
  if (!lead) throw leadNotFound();
  if (lead.aiMode === nextMode) return;
  if (nextMode === "autopilot" && !parseChannelKey(lead.channelKey)) {
    throw new AppError("no_channel", "У лида нет канала связи — автопилоту некуда отвечать", 409);
  }

  await leadRepository.update(db, leadId, {
    aiMode: nextMode,
    ...(nextMode === "autopilot" ? { needsHuman: false } : {}),
  });
  log.info({ leadId, from: lead.aiMode, to: nextMode }, "AI mode changed");
}

/** «Взял в работу»: the manager has seen the handoff. */
export async function markHandled(leadId: string): Promise<void> {
  const lead = await leadRepository.findById(db, leadId);
  if (!lead) throw leadNotFound();
  if (!lead.needsHuman) return;
  await leadRepository.update(db, leadId, { needsHuman: false });
  log.info({ leadId }, "lead marked as handled");
}

export async function assignTag(input: { leadId: string; tagId: string; origin?: "manual" | "rule" }): Promise<void> {
  const origin = input.origin ?? "manual";
  const [lead, tag] = await Promise.all([
    leadRepository.findById(db, input.leadId),
    tagRepository.findById(db, input.tagId),
  ]);
  if (!lead) throw leadNotFound();
  if (!tag) throw new AppError("tag_not_found", "Тег не найден", 404);

  await leadTagRepository.assign(db, { leadId: input.leadId, tagId: input.tagId, origin });
  log.info({ leadId: input.leadId, tagId: input.tagId, origin }, "tag assigned");
}

/**
 * Any removed tag is dismissed, never deleted: the row is the manager's "do not re-add" decision,
 * so the AI never puts it back — also after an accepted AI hint or a remove → add → remove.
 */
export async function removeTag(input: { leadId: string; tagId: string }): Promise<void> {
  const assignment = await leadTagRepository.find(db, input.leadId, input.tagId);
  if (!assignment || assignment.dismissedAt) return;

  await leadTagRepository.dismiss(db, input.leadId, input.tagId, new Date());
  log.info({ leadId: input.leadId, tagId: input.tagId, origin: assignment.origin, fix: "DEF-04" }, "tag removed (dismissed)");
}
