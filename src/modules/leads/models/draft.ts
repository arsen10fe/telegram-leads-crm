export type DraftStatusValue = "pending" | "sent" | "rejected" | "superseded";

/**
 * Allowed reply-draft transitions. `sent → pending` is the release after a failed delivery.
 * Transitions run as conditional updates (`updateMany where status = from`), never check-then-set.
 */
const TRANSITIONS: Record<DraftStatusValue, readonly DraftStatusValue[]> = {
  pending: ["sent", "rejected", "superseded"],
  sent: ["pending"],
  rejected: [],
  superseded: [],
};

export function canTransitionDraft(from: DraftStatusValue, to: DraftStatusValue): boolean {
  return TRANSITIONS[from].includes(to);
}
