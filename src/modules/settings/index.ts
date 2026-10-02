import { getSettings, updateSettings } from "./services/settings-service";

/** Public API of the settings module (the agency profile, knowledge base and AI defaults). */
export const settings = {
  get: getSettings,
  update: updateSettings,
};

export {
  AI_MODES,
  AgencySettingsUpdate,
  DEFAULT_AGENCY_SETTINGS,
  DEFAULT_TRIGGER_WORDS,
  KNOWLEDGE_BASE_MAX_LENGTH,
  TRIGGER_WORDS_MAX_COUNT,
  TRIGGER_WORD_MAX_LENGTH,
  TriggerWordsInput,
  type AgencySettings,
  type AgencySettingsValues,
  type AiModeValue,
} from "./models/agency-settings";
