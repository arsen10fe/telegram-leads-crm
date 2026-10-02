import { leads } from "@/modules/leads";
import { businessWindowClosesAt, canReplyInBusinessChat } from "../models/business-connection";
import { businessConnectionRepository } from "../repositories/business-connection-repository";

export type ReplyAvailability =
  | { canReply: true; channel: "bot" }
  | { canReply: true; channel: "business"; closesAt: Date | null }
  | { canReply: false; reason: "no_channel" | "business_window_closed" | "business_disconnected" };

/** Whether the manager can answer this lead from the CRM right now, and why not. */
export async function getReplyAvailability(leadId: string, now: Date = new Date()): Promise<ReplyAvailability> {
  const target = await leads.getChannelTarget(leadId);
  if (!target) return { canReply: false, reason: "no_channel" };
  if (target.channel.kind === "bot") return { canReply: true, channel: "bot" };

  const connection = await businessConnectionRepository.find(target.channel.connectionId);
  if (!connection?.isEnabled || !connection.canReply) return { canReply: false, reason: "business_disconnected" };
  if (!canReplyInBusinessChat(connection, target.lastInboundAt, now)) {
    return { canReply: false, reason: "business_window_closed" };
  }
  return { canReply: true, channel: "business", closesAt: businessWindowClosesAt(target.lastInboundAt, now) };
}
