import { db } from "@/shared/db";
import { createLogger } from "@/shared/logger";
import {
  AgencySettingsUpdate,
  DEFAULT_AGENCY_SETTINGS,
  type AgencySettings,
  type AgencySettingsValues,
} from "../models/agency-settings";
import { settingsRepository } from "../repositories/settings-repository";

const log = createLogger("settings");

/** The agency profile. Creates the defaults row if the seed has not run yet. */
export async function getSettings(): Promise<AgencySettings> {
  const existing = await settingsRepository.find(db);
  if (existing) return existing;
  log.warn("agency settings row missing: defaults created");
  return settingsRepository.createIfMissing(db, DEFAULT_AGENCY_SETTINGS);
}

function changedKeys(before: AgencySettings, patch: AgencySettingsUpdate): string[] {
  return (Object.keys(patch) as Array<keyof AgencySettingsValues>).filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(patch[key]),
  );
}

/** Validates and applies a partial update. Throws ZodError on invalid input. */
export async function updateSettings(input: unknown): Promise<AgencySettings> {
  const patch = AgencySettingsUpdate.parse(input);
  const before = await getSettings();
  const keys = changedKeys(before, patch);
  if (keys.length === 0) {
    log.debug("agency settings unchanged");
    return before;
  }
  const updated = await settingsRepository.update(db, patch);
  log.info({ changedKeys: keys }, "agency settings updated");
  return updated;
}
