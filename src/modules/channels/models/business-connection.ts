/** Telegram lets a business bot reply only in chats with an incoming message in the last 24 hours. */
export const BUSINESS_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type BusinessConnectionState = { isEnabled: boolean; canReply: boolean };

export type BusinessConnectionRecord = BusinessConnectionState & {
  id: string;
  ownerUserId: bigint;
  ownerChatId: bigint;
  ownerName: string | null;
  ownerUsername: string | null;
  updatedAt: Date;
};

/** Checked before calling Telegram, so the manager gets a clear reason instead of an API error. */
export function canReplyInBusinessChat(
  connection: BusinessConnectionState | null,
  lastInboundAt: Date | null,
  now: Date,
): boolean {
  if (!connection?.isEnabled || !connection.canReply || !lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < BUSINESS_REPLY_WINDOW_MS;
}

/** When the reply window closes for a chat, or null if it is already closed / never opened. */
export function businessWindowClosesAt(lastInboundAt: Date | null, now: Date): Date | null {
  if (!lastInboundAt) return null;
  const closesAt = new Date(lastInboundAt.getTime() + BUSINESS_REPLY_WINDOW_MS);
  return closesAt.getTime() > now.getTime() ? closesAt : null;
}
