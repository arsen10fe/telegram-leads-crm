// Runs on every deploy (compose `migrate` service) and via `npm run db:seed`.
// It must never overwrite what managers changed in the CRM:
// - the agency profile is created once (or filled in if only the empty fallback row exists);
// - demo tags and demo leads go only into an empty CRM, so deleted demo data never comes back;
// - only the demo manager's password hash is refreshed from env.
import { hashPassword } from "@/modules/auth";
import { tagNameKey } from "@/modules/leads";
import { DEFAULT_AGENCY_SETTINGS } from "@/modules/settings";
import { db, disconnectDb } from "@/shared/db";
import { getEnv } from "@/shared/env";
import { createLogger } from "@/shared/logger";
import { AGENCY_NAME, DEMO_LEADS, KNOWLEDGE_BASE, TAGS, type DemoLead } from "./seed-data";

const log = createLogger("seed");

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

type Counts = { created: number; skipped: number };

async function seedManager(): Promise<Counts & { passwordRefreshed: number }> {
  const { SEED_MANAGER_EMAIL, SEED_MANAGER_PASSWORD } = getEnv();
  if (!SEED_MANAGER_EMAIL || !SEED_MANAGER_PASSWORD) {
    log.warn("SEED_MANAGER_EMAIL or SEED_MANAGER_PASSWORD is not set: demo manager skipped");
    return { created: 0, skipped: 1, passwordRefreshed: 0 };
  }
  const email = SEED_MANAGER_EMAIL.toLowerCase();
  const passwordHash = await hashPassword(SEED_MANAGER_PASSWORD);
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  await db.user.upsert({
    where: { email },
    create: { email, passwordHash, name: "Менеджер" },
    update: { passwordHash },
  });
  return existing
    ? { created: 0, skipped: 0, passwordRefreshed: 1 }
    : { created: 1, skipped: 0, passwordRefreshed: 0 };
}

async function seedAgencySettings(): Promise<Counts & { filled: number }> {
  const demoProfile = { agencyName: AGENCY_NAME, knowledgeBase: KNOWLEDGE_BASE };
  const existing = await db.agencySettings.findUnique({ where: { id: 1 } });
  if (!existing) {
    await db.agencySettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...DEFAULT_AGENCY_SETTINGS, ...demoProfile },
      update: {},
    });
    return { created: 1, skipped: 0, filled: 0 };
  }

  // The app creates an empty fallback row if it starts before the seed; fill only that row.
  const isUntouchedFallback =
    existing.knowledgeBase.trim() === "" && existing.agencyName === DEFAULT_AGENCY_SETTINGS.agencyName;
  if (!isUntouchedFallback) return { created: 0, skipped: 1, filled: 0 };

  await db.agencySettings.update({ where: { id: 1 }, data: demoProfile });
  return { created: 0, skipped: 0, filled: 1 };
}

async function isCrmEmpty(): Promise<boolean> {
  const [tags, leads] = await Promise.all([db.tag.count(), db.lead.count()]);
  return tags === 0 && leads === 0;
}

async function seedTags(): Promise<Map<string, string>> {
  const idsByKey = new Map<string, string>();
  for (const tag of TAGS) {
    const nameKey = tagNameKey(tag.name);
    const row = await db.tag.upsert({
      where: { nameKey },
      create: { name: tag.name, nameKey, color: tag.color },
      update: {},
      select: { id: true },
    });
    idsByKey.set(nameKey, row.id);
  }
  return idsByKey;
}

function latest(dates: Date[]): Date | null {
  return dates.length === 0 ? null : new Date(Math.max(...dates.map((date) => date.getTime())));
}

async function seedDemoLead(demo: DemoLead, tagIdsByKey: Map<string, string>): Promise<void> {
  const createdAt = new Date(Date.now() - demo.hoursAgo * HOUR_MS);
  const messages = demo.messages.map((message) => ({
    direction: message.direction,
    author: message.author,
    text: message.text,
    meta: message.meta,
    createdAt: new Date(createdAt.getTime() + message.minutesAfter * MINUTE_MS),
  }));
  const inboundAt = messages.filter((m) => m.direction === "inbound").map((m) => m.createdAt);
  const outboundAt = messages.filter((m) => m.direction === "outbound").map((m) => m.createdAt);
  // Hints are stored as tag ids, like the AI pipeline stores them.
  const hints = demo.qualification.hints.flatMap((name) => tagIdsByKey.get(tagNameKey(name)) ?? []);

  await db.lead.upsert({
    where: { id: demo.id },
    update: {},
    create: {
      id: demo.id,
      name: demo.name,
      contact: demo.contact,
      contactType: demo.contactType,
      request: demo.request,
      source: demo.source,
      aiMode: demo.aiMode,
      needsHuman: demo.needsHuman ?? false,
      handoffReason: demo.handoffReason ?? null,
      handoffAt: demo.needsHuman ? createdAt : null,
      qualification: { ...demo.qualification, hints, model: "demo" },
      aiStatus: "ok",
      qualifiedAt: new Date(createdAt.getTime() + MINUTE_MS),
      lastInboundAt: latest(inboundAt),
      lastOutboundAt: latest(outboundAt),
      lastActivityAt: latest([createdAt, ...inboundAt, ...outboundAt]) ?? createdAt,
      createdAt,
      tags: {
        create: demo.tags.map((tag) => {
          const tagId = tagIdsByKey.get(tagNameKey(tag.name));
          if (!tagId) throw new Error(`Demo lead ${demo.id} references unknown tag ${tag.name}`);
          return { tagId, origin: tag.origin, confidence: tag.confidence ?? null, createdAt };
        }),
      },
      messages: { create: messages },
    },
  });
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  log.info("seed started");

  const manager = await seedManager();
  log.info({ model: "User", ...manager }, "demo manager seeded");

  const settings = await seedAgencySettings();
  log.info({ model: "AgencySettings", ...settings }, "agency settings seeded");

  if (!(await isCrmEmpty())) {
    log.info(
      { model: "Tag+Lead", created: 0, skipped: TAGS.length + DEMO_LEADS.length },
      "CRM already has data: demo tags and leads skipped",
    );
  } else {
    const tagIdsByKey = await seedTags();
    log.info({ model: "Tag", created: tagIdsByKey.size, skipped: 0 }, "demo tags seeded");
    for (const demo of DEMO_LEADS) await seedDemoLead(demo, tagIdsByKey);
    log.info({ model: "Lead", created: DEMO_LEADS.length, skipped: 0 }, "demo leads seeded");
  }

  log.info({ ms: Date.now() - startedAt }, "seed finished");
}

try {
  await main();
} catch (error) {
  log.error({ err: error }, "seed failed");
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
