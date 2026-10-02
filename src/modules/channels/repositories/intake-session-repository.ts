import { db, type Db } from "@/shared/db";
import { isIntakeStep, parseIntakeData, SESSION_TTL_MS, type IntakeData, type IntakeStep } from "../models/intake-form";

export type ActiveIntakeSession = { step: IntakeStep; data: IntakeData };

export const intakeSessionRepository = {
  /** The form in progress for this chat; null if there is none, it expired, or it is corrupted. */
  async findActive(chatId: bigint, now: Date = new Date()): Promise<ActiveIntakeSession | null> {
    const row = await db.intakeSession.findUnique({ where: { telegramChatId: chatId } });
    if (!row) return null;
    if (now.getTime() - row.updatedAt.getTime() > SESSION_TTL_MS) return null;
    const data = parseIntakeData(row.data);
    if (!isIntakeStep(row.step) || !data) return null;
    return { step: row.step, data };
  },

  async save(chatId: bigint, step: IntakeStep, data: IntakeData): Promise<void> {
    await db.intakeSession.upsert({
      where: { telegramChatId: chatId },
      create: { telegramChatId: chatId, step, data },
      update: { step, data },
    });
  },

  /** Accepts a transaction client: the completed form is cleared in the lead's transaction. */
  async delete(chatId: bigint, client: Db = db): Promise<void> {
    await client.intakeSession.deleteMany({ where: { telegramChatId: chatId } });
  },
};
