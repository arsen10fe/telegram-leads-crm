import type { BusinessConnection } from "grammy/types";
import { createLogger, errorInfo } from "@/shared/logger";
import type { BusinessConnectionRecord } from "../models/business-connection";
import {
  businessConnectionRepository,
  type BusinessConnectionInput,
} from "../repositories/business-connection-repository";

const log = createLogger("channels.business");

export function fromTelegramConnection(connection: BusinessConnection): BusinessConnectionInput {
  const ownerName = [connection.user.first_name, connection.user.last_name].filter(Boolean).join(" ");
  return {
    id: connection.id,
    ownerUserId: BigInt(connection.user.id),
    ownerChatId: BigInt(connection.user_chat_id),
    ownerName: ownerName || null,
    ownerUsername: connection.user.username ?? null,
    canReply: connection.rights?.can_reply ?? false,
    isEnabled: connection.is_enabled,
  };
}

/** Saves the connection; `isNewlyEnabled` is true when the account was just connected or re-enabled. */
export async function upsertConnection(
  input: BusinessConnectionInput,
): Promise<{ connection: BusinessConnectionRecord; isNewlyEnabled: boolean }> {
  const previous = await businessConnectionRepository.find(input.id);
  const connection = await businessConnectionRepository.upsert(input);
  log.info(
    { connectionId: connection.id, enabled: connection.isEnabled, canReply: connection.canReply },
    "business connection upserted",
  );
  return { connection, isNewlyEnabled: connection.isEnabled && !previous?.isEnabled };
}

/**
 * The connection from the database; if it is missing (e.g. connected while the bot was offline
 * before this feature existed), fetch it from Telegram once and store it.
 */
export async function getOrFetchConnection(
  id: string,
  fetchFromTelegram: () => Promise<BusinessConnection>,
): Promise<BusinessConnectionRecord | null> {
  const stored = await businessConnectionRepository.find(id);
  if (stored) return stored;
  try {
    const { connection } = await upsertConnection(fromTelegramConnection(await fetchFromTelegram()));
    return connection;
  } catch (error) {
    log.warn({ connectionId: id, ...errorInfo(error) }, "unknown business connection: fetch failed");
    return null;
  }
}

export function findConnection(id: string): Promise<BusinessConnectionRecord | null> {
  return businessConnectionRepository.find(id);
}

/** For the settings page. */
export function listConnections(): Promise<BusinessConnectionRecord[]> {
  return businessConnectionRepository.listRecent();
}

/** Part of the CRM change stamp: a lead's reply availability depends on its connection. */
export function getConnectionsStamp(): Promise<string> {
  return businessConnectionRepository.changeStamp();
}
