import {
  claimDraft,
  createDraft,
  getAiContext,
  getAutopilotState,
  getDraftState,
  getPendingDraft,
  handOff,
  latestInboundMessageId,
  rejectDraft,
  releaseDraft,
  saveQualification,
  setAiStatus,
} from "./services/ai-api-service";
import {
  getChannelTarget,
  getLeadSummary,
  recordManagerMessage,
  recordOutbound,
} from "./services/conversation-service";
import { ingestInbound, submitIntake } from "./services/ingest-inbound-service";
import {
  assignTag,
  createManualLead,
  getLeadDetails,
  listLeads,
  markHandled,
  removeTag,
  setAiMode,
  updateLeadFields,
} from "./services/lead-service";
import {
  createTag,
  deleteTag,
  findOrCreateTag,
  listTags,
  listTagsWithCounts,
  updateTag,
} from "./services/tag-service";

/** Public API of the leads module. Other modules and the web layer use only this. */
export const leads = {
  // ingestion (every channel goes through here)
  ingestInbound,
  submitIntake,
  // conversation records and lookups for sending/notifications
  recordOutbound,
  recordManagerMessage,
  getChannelTarget,
  getLeadSummary,
  // AI-facing API (used by the ai module and its jobs)
  getAiContext,
  getAutopilotState,
  latestInboundMessageId,
  setAiStatus,
  saveQualification,
  handOff,
  createDraft,
  getPendingDraft,
  getDraftState,
  claimDraft,
  releaseDraft,
  rejectDraft,
  // leads and tags
  createManualLead,
  listLeads,
  getLeadDetails,
  updateLeadFields,
  setAiMode,
  markHandled,
  assignTag,
  removeTag,
  listTags,
  listTagsWithCounts,
  createTag,
  findOrCreateTag,
  updateTag,
  deleteTag,
};

export { parseContact, parsePhone, telegramContact, type ContactType, type ParsedContact } from "./models/contact";
export {
  BOT_CHANNEL,
  LEAD_CONTACT_MAX_LENGTH,
  LEAD_NAME_MAX_LENGTH,
  LEAD_REQUEST_MAX_LENGTH,
  businessChannelKey,
  isAwaitingReply,
  parseChannelKey,
  type ChannelRef,
  type InboundMessage,
  type LeadSourceValue,
  type TelegramUser,
} from "./models/lead";
export {
  AiModeInput,
  CreateLeadInput,
  TagInput,
  TagUpdateInput,
  UpdateLeadFieldsInput,
} from "./models/lead-input";
export type {
  AiStatusValue,
  LeadDetails,
  LeadListItem,
  LeadMessageView,
  LeadTagView,
  TagOriginValue,
  TagView,
  TagWithCount,
} from "./models/lead-view";
export {
  SERVICES,
  TEMPERATURES,
  URGENCIES,
  readQualification,
  type StoredQualification,
  type Temperature,
} from "./models/qualification";
export {
  DEFAULT_TAG_COLOR,
  TAG_COLORS,
  TAG_NAME_MAX_LENGTH,
  isTagColor,
  normalizeTagName,
  pickTagColor,
  tagNameKey,
  type TagColor,
} from "./models/tag";
export type { HandoffReasonValue } from "./models/handoff";
export type { LeadListFilters } from "./repositories/lead-repository";
export type { AiContext, AiContextMessage, AutopilotState, DraftView } from "./services/ai-api-service";
export type {
  ChannelTarget,
  LeadSummary,
  ManagerMessageInput,
  OutboundInput,
} from "./services/conversation-service";
export type {
  IngestResult,
  IntakeSubmission,
  SubmitIntakeResult,
} from "./services/ingest-inbound-service";
