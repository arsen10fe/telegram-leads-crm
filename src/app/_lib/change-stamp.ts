import "server-only";
import { cache } from "react";
import { channels } from "@/modules/channels";
import { leads } from "@/modules/leads";

/** Fingerprint of everything the live CRM pages show; /api/changes serves the same value. */
export async function computeChangeStamp(): Promise<string> {
  const [leadsStamp, channelsStamp] = await Promise.all([leads.getChangeStamp(), channels.getChangeStamp()]);
  return `${leadsStamp}.${channelsStamp}`;
}

/**
 * The stamp for <AutoRefresh>, once per request. Await it BEFORE reading the page data: a change
 * that lands in between then causes one extra refresh instead of being missed.
 */
export const readChangeStamp = cache(computeChangeStamp);
