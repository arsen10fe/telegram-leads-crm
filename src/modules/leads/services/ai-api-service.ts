import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/shared/db";
import { enqueue } from "@/shared/jobs";
import { createLogger } from "@/shared/logger";
import { handoffNote, type HandoffReasonValue } from "../models/handoff";
import type { LeadSourceValue } from "../models/lead";
import type { AiStatusValue } from "../models/lead-view";
import type { StoredQualification } from "../models/qualification";
import { draftRepository } from "../repositories/draft-repository";
import { leadRepository } from "../repositories/lead-repository";
import { leadTagRepository } from "../repositories/lead-tag-repository";
import { messageRepository } from "../repositories/message-repository";

const log = createLogger("leads.ai");

const AI_CONTEXT_MESSAGES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AiContextMessage = { author: "client" | "manager" | "ai"; text: string; createdAt: Date };

export type AiContext = {
  lead: {
    id: string;
    source: LeadSourceValue;
    name: string;
    contact: string | null;
    request: string | null;
    aiMode: "autopilot" | "copilot" | "off";
    needsHuman: boolean;
    channelKey: string | null;
  };
  /** The last messages the client actually saw: no internal notes, no failed sends. */
  messages: AiContextMessage[];
  tagIds: ReadonlySet<string>;
  dismissedTagIds: ReadonlySet<string>;
  /** AI replies attempted in the last 24 h, failed sends included (caps count attempts). */
  aiTurnsLast24h: number;
};

export async function getAiContext(leadId: string, now: Date = new Date()): Promise<AiContext | null> {
  const lead = await leadRepository.findById(db, leadId);
  if (!lead) return null;
  const [recent, assignments, aiTurnsLast24h] = await Promise.all([
    messageRepository.listByLead(db, leadId, AI_CONTEXT_MESSAGES * 2),
    leadTagRepository.listForLead(db, leadId),
    messageRepository.countAiTurnsSince(db, leadId, new Date(now.getTime() - DAY_MS)),
  ]);

  const messages = recent
    .filter((message) => message.direction !== "internal" && message.deliveryError === null)
    .slice(0, AI_CONTEXT_MESSAGES)
    .reverse()
    .map((message) => ({
      author: message.author === "client" ? ("client" as const) : message.author === "ai" ? ("ai" as const) : ("manager" as const),
      text: message.text,
      createdAt: message.createdAt,
    }));

  return {
    lead: {
      id: lead.id,
      source: lead.source,
      name: lead.name,
      contact: lead.contact,
      request: lead.request,
      aiMode: lead.aiMode,
      needsHuman: lead.needsHuman,
      channelKey: lead.channelKey,
    },
    messages,
    tagIds: new Set(assignments.filter((a) => a.dismissedAt === null).map((a) => a.tagId)),
    dismissedTagIds: new Set(assignments.filter((a) => a.dismissedAt !== null).map((a) => a.tagId)),
    aiTurnsLast24h,
  };
}

export async function latestInboundMessageId(leadId: string): Promise<string | null> {
  return messageRepository.latestInboundId(db, leadId);
}

export async function setAiStatus(leadId: string, status: AiStatusValue): Promise<void> {
  await leadRepository.update(db, leadId, { aiStatus: status });
  log.debug({ leadId, status }, "AI status set");
}

/** Qualification + AI tags in one transaction. Existing and dismissed tags are never touched. */
export async function saveQualification(input: {
  leadId: string;
  qualification: StoredQualification;
  aiTags: Array<{ tagId: string; confidence: number }>;
}): Promise<void> {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await leadRepository.update(tx, input.leadId, {
      qualification: input.qualification as Prisma.InputJsonValue,
      aiStatus: "ok",
      qualifiedAt: now,
    });
    if (input.aiTags.length > 0) {
      await leadTagRepository.createAiIfAbsent(tx, { leadId: input.leadId, tags: input.aiTags });
    }
  });
  log.info(
    { leadId: input.leadId, aiTags: input.aiTags.map((tag) => tag.tagId), temperature: input.qualification.temperature },
    "qualification saved",
  );
}

/**
 * The AI gives the dialog to a human. State, the system note and the manager notification commit
 * together, so a handoff can never be «just words» from the model. Idempotent: returns false (and
 * does nothing) when the lead already left autopilot or already waits for a human.
 */
export async function handOff(input: { leadId: string; reason: HandoffReasonValue }): Promise<boolean> {
  const now = new Date();
  const handedOff = await db.$transaction(async (tx) => {
    const changed = await leadRepository.markHandedOff(tx, input.leadId, input.reason, now);
    if (!changed) return false;
    await messageRepository.createSystem(tx, {
      leadId: input.leadId,
      text: handoffNote(input.reason),
      meta: { kind: "handoff", reason: input.reason },
    });
    await enqueue(tx, "notify_handoff", { leadId: input.leadId });
    return true;
  });
  if (handedOff) log.info({ leadId: input.leadId, reason: input.reason }, "handoff");
  else log.debug({ leadId: input.leadId, reason: input.reason }, "handoff skipped: not in autopilot or already with a human");
  return handedOff;
}

export type AutopilotState = {
  aiMode: "autopilot" | "copilot" | "off";
  needsHuman: boolean;
  lastOutboundAt: Date | null;
  latestInboundMessageId: string | null;
};

/** A cheap snapshot to detect that a human answered or took over while the AI was thinking. */
export async function getAutopilotState(leadId: string): Promise<AutopilotState | null> {
  const [lead, latestInboundMessageId] = await Promise.all([
    leadRepository.findById(db, leadId),
    messageRepository.latestInboundId(db, leadId),
  ]);
  if (!lead) return null;
  return {
    aiMode: lead.aiMode,
    needsHuman: lead.needsHuman,
    lastOutboundAt: lead.lastOutboundAt,
    latestInboundMessageId,
  };
}

export type DraftView = {
  id: string;
  leadId: string;
  text: string;
  noteForManager: string | null;
  createdAt: Date;
};

function toDraftView(draft: { id: string; leadId: string; text: string; noteForManager: string | null; createdAt: Date }): DraftView {
  return { id: draft.id, leadId: draft.leadId, text: draft.text, noteForManager: draft.noteForManager, createdAt: draft.createdAt };
}

/** At most one pending draft per lead: a new one rejects the previous. */
export async function createDraft(input: {
  leadId: string;
  text: string;
  noteForManager?: string | null;
  meta?: Prisma.InputJsonValue;
}): Promise<DraftView> {
  const now = new Date();
  const draft = await db.$transaction(async (tx) => {
    const rejected = await draftRepository.rejectPendingForLead(tx, input.leadId, now);
    if (rejected > 0) log.debug({ leadId: input.leadId, count: rejected, to: "rejected" }, "previous draft replaced");
    return draftRepository.create(tx, input);
  });
  log.debug({ draftId: draft.id, from: null, to: "pending" }, "draft transition");
  return toDraftView(draft);
}

export async function getPendingDraft(leadId: string): Promise<DraftView | null> {
  const draft = await draftRepository.findLatestPending(db, leadId);
  return draft ? toDraftView(draft) : null;
}

/** For the lead card: the pending draft, or whether the latest one went stale (the client wrote again). */
export async function getDraftState(leadId: string): Promise<{ pending: DraftView | null; latestSuperseded: boolean }> {
  const latest = await draftRepository.findLatest(db, leadId);
  if (!latest) return { pending: null, latestSuperseded: false };
  if (latest.status === "pending") return { pending: toDraftView(latest), latestSuperseded: false };
  return { pending: null, latestSuperseded: latest.status === "superseded" };
}

/** pending → sent, atomically. null when it was already sent, rejected or superseded. */
export async function claimDraft(input: { draftId: string; actorId: string | null }): Promise<DraftView | null> {
  const claimed = await draftRepository.claim(db, input.draftId, input.actorId, new Date());
  if (!claimed) {
    log.warn({ draftId: input.draftId }, "draft claim conflict");
    return null;
  }
  log.debug({ draftId: input.draftId, from: "pending", to: "sent" }, "draft transition");
  const draft = await draftRepository.findById(db, input.draftId);
  return draft ? toDraftView(draft) : null;
}

/**
 * After a failed delivery: sent → pending, so the manager can try again — unless the client wrote
 * in the meantime, then the draft is stale (superseded) and must not come back as current.
 */
export async function releaseDraft(input: { draftId: string }): Promise<void> {
  const draft = await draftRepository.findById(db, input.draftId);
  if (!draft) return;
  const lead = await leadRepository.findById(db, draft.leadId);
  const clientWroteSince = Boolean(lead?.lastInboundAt && lead.lastInboundAt.getTime() > draft.createdAt.getTime());
  if (clientWroteSince) {
    await draftRepository.supersedeSent(db, input.draftId, new Date());
    log.debug({ draftId: input.draftId, from: "sent", to: "superseded" }, "draft transition");
    return;
  }
  const released = await draftRepository.release(db, input.draftId);
  log.debug({ draftId: input.draftId, from: "sent", to: "pending", released }, "draft transition");
}

export async function rejectDraft(input: { draftId: string; actorId: string | null }): Promise<boolean> {
  const rejected = await draftRepository.reject(db, input.draftId, input.actorId, new Date());
  log.debug({ draftId: input.draftId, from: "pending", to: "rejected", rejected }, "draft transition");
  return rejected;
}
