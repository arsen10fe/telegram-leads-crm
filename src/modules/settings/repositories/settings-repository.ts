import type { AgencySettings as AgencySettingsRow } from "@/generated/prisma/client";
import type { Db } from "@/shared/db";
import type { AgencySettings, AgencySettingsUpdate, AgencySettingsValues } from "../models/agency-settings";

/** The agency profile is a singleton row. */
const SETTINGS_ID = 1;

function toAgencySettings(row: AgencySettingsRow): AgencySettings {
  return {
    agencyName: row.agencyName,
    knowledgeBase: row.knowledgeBase,
    defaultAiModeBot: row.defaultAiModeBot,
    defaultAiModeBusiness: row.defaultAiModeBusiness,
    triggerWords: row.triggerWords,
    autopilotMaxTurns: row.autopilotMaxTurns,
    minConfidence: row.minConfidence,
    updatedAt: row.updatedAt,
  };
}

export const settingsRepository = {
  async find(client: Db): Promise<AgencySettings | null> {
    const row = await client.agencySettings.findUnique({ where: { id: SETTINGS_ID } });
    return row ? toAgencySettings(row) : null;
  },

  /** Race-safe: two processes creating the row at once both end up with the same row. */
  async createIfMissing(client: Db, values: AgencySettingsValues): Promise<AgencySettings> {
    const row = await client.agencySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...values },
      update: {},
    });
    return toAgencySettings(row);
  },

  async update(client: Db, patch: AgencySettingsUpdate): Promise<AgencySettings> {
    const row = await client.agencySettings.update({ where: { id: SETTINGS_ID }, data: patch });
    return toAgencySettings(row);
  },
};
