import { z } from "zod";
import type { ContactType, ParsedContact } from "@/modules/leads";

// The bot form as a pure step machine: name → contact → request. State is persisted between
// messages by the controller, so the form survives restarts and deploys.

export const INTAKE_STEPS = ["name", "contact", "request"] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

export type IntakeData = { name?: string; contact?: string; contactType?: ContactType };

/** The controller pre-parses contacts, so this model stays free of I/O and other modules. */
export type IntakeInput =
  | { kind: "text"; text: string; contact: ParsedContact | null }
  | { kind: "shared_phone"; contact: ParsedContact | null }
  | { kind: "use_telegram"; contact: ParsedContact }
  | { kind: "unsupported" };

export type CompletedIntake = { name: string; contact: string; contactType: ContactType; request: string };

export type IntakeTransition =
  | { kind: "ask"; step: IntakeStep; data: IntakeData; retry?: "invalid" | "unsupported" }
  | { kind: "complete"; lead: CompletedIntake };

/** A form left unfinished for a day starts over. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const NAME_MIN = 2;
const NAME_MAX = 100;
const REQUEST_MIN = 3;
const REQUEST_MAX = 2_000;

const IntakeDataSchema = z.object({
  name: z.string().optional(),
  contact: z.string().optional(),
  contactType: z.enum(["phone", "telegram", "email"]).optional(),
});

export function isIntakeStep(value: string): value is IntakeStep {
  return (INTAKE_STEPS as readonly string[]).includes(value);
}

/** Session JSON from the database is untrusted: anything unexpected restarts the form. */
export function parseIntakeData(value: unknown): IntakeData | null {
  const parsed = IntakeDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function nameStep(data: IntakeData, input: IntakeInput): IntakeTransition {
  if (input.kind === "unsupported") return { kind: "ask", step: "name", data, retry: "unsupported" };
  if (input.kind !== "text") return { kind: "ask", step: "name", data, retry: "invalid" };
  const name = input.text.trim();
  const looksLikeCommand = name.startsWith("/");
  if (looksLikeCommand || name.length < NAME_MIN || name.length > NAME_MAX) {
    return { kind: "ask", step: "name", data, retry: "invalid" };
  }
  return { kind: "ask", step: "contact", data: { ...data, name } };
}

function contactStep(data: IntakeData, input: IntakeInput): IntakeTransition {
  if (input.kind === "unsupported") return { kind: "ask", step: "contact", data, retry: "unsupported" };
  if (!input.contact) return { kind: "ask", step: "contact", data, retry: "invalid" };
  return {
    kind: "ask",
    step: "request",
    data: { ...data, contact: input.contact.value, contactType: input.contact.type },
  };
}

function requestStep(data: IntakeData, input: IntakeInput): IntakeTransition {
  if (input.kind === "unsupported") return { kind: "ask", step: "request", data, retry: "unsupported" };
  if (input.kind !== "text") return { kind: "ask", step: "request", data, retry: "invalid" };
  const request = input.text.trim();
  if (request.length < REQUEST_MIN) return { kind: "ask", step: "request", data, retry: "invalid" };
  // A corrupted session (no name or contact) starts over instead of creating a broken lead.
  if (!data.name || !data.contact || !data.contactType) return { kind: "ask", step: "name", data: {} };
  return {
    kind: "complete",
    lead: { name: data.name, contact: data.contact, contactType: data.contactType, request: request.slice(0, REQUEST_MAX) },
  };
}

export function advanceIntake(step: IntakeStep, data: IntakeData, input: IntakeInput): IntakeTransition {
  if (step === "name") return nameStep(data, input);
  if (step === "contact") return contactStep(data, input);
  return requestStep(data, input);
}
