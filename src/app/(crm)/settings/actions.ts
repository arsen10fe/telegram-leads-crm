"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/modules/auth";
import { AgencySettingsUpdate, settings } from "@/modules/settings";
import { getEnv } from "@/shared/env";
import { AppError } from "@/shared/errors";
import { fail, ok, type ActionResult } from "../../_lib/action-result";
import { requireSession } from "../../_lib/session";

/** One-time deep link: the manager presses Start in the bot and gets notifications in that chat. */
export async function createTelegramLinkAction(): Promise<ActionResult<{ url: string }>> {
  const session = await requireSession();
  try {
    const botUsername = getEnv().TELEGRAM_BOT_USERNAME;
    if (!botUsername) throw new AppError("telegram_not_configured", "Бот не настроен: задайте TELEGRAM_BOT_USERNAME");
    const token = await auth.createTelegramLinkToken(session.userId);
    return ok({ url: `https://t.me/${botUsername}?start=link_${token}` });
  } catch (error) {
    return fail("createTelegramLink", error);
  }
}

export async function unlinkTelegramAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await auth.unlinkTelegram(session.userId);
    revalidatePath("/settings");
    return ok(null);
  } catch (error) {
    return fail("unlinkTelegram", error);
  }
}

export async function updateAgencySettingsAction(raw: unknown): Promise<ActionResult> {
  await requireSession();
  try {
    await settings.update(AgencySettingsUpdate.parse(raw));
    revalidatePath("/settings");
    return ok(null);
  } catch (error) {
    return fail("updateAgencySettings", error);
  }
}
