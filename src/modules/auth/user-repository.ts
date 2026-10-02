import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/shared/db";

export const userRepository = {
  findByEmail(client: Db, email: string) {
    return client.user.findUnique({ where: { email } });
  },

  findById(client: Db, id: string) {
    return client.user.findUnique({ where: { id } });
  },

  findByLinkToken(client: Db, linkToken: string) {
    return client.user.findUnique({ where: { linkToken } });
  },

  update(client: Db, id: string, data: Prisma.UserUpdateInput) {
    return client.user.update({ where: { id }, data });
  },

  /** One Telegram chat receives notifications for one manager only. */
  unlinkChatFromOthers(client: Db, chatId: bigint, keepUserId: string) {
    return client.user.updateMany({
      where: { telegramChatId: chatId, id: { not: keepUserId } },
      data: { telegramChatId: null, telegramLinkedAt: null },
    });
  },

  listTelegramChatIds(client: Db) {
    return client.user.findMany({
      where: { telegramChatId: { not: null } },
      select: { telegramChatId: true },
    });
  },
};
