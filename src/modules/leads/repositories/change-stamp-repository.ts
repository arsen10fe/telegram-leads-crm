import type { Db } from "@/shared/db";

export const changeStampRepository = {
  /**
   * A fingerprint of every lead, message, tag, tag assignment and reply draft. Counts catch
   * deletions, max timestamps catch updates, and tags are hashed whole (Tag has no updatedAt).
   */
  async read(client: Db): Promise<string> {
    const rows = await client.$queryRaw<Array<{ stamp: string }>>`
      SELECT md5(concat_ws('|',
        (SELECT count(*) || ':' || coalesce(max("updatedAt")::text, '') FROM "Lead"),
        (SELECT count(*) || ':' || coalesce(max("createdAt")::text, '') FROM "Message"),
        (SELECT count(*) || ':' || count(*) FILTER (WHERE "dismissedAt" IS NULL) || ':'
          || coalesce(max(greatest("createdAt", "dismissedAt"))::text, '') FROM "LeadTag"),
        (SELECT coalesce(string_agg(id || ':' || name || ':' || color, ',' ORDER BY id), '') FROM "Tag"),
        (SELECT count(*) || ':' || count(*) FILTER (WHERE status = 'pending') || ':'
          || coalesce(max(greatest("createdAt", "decidedAt"))::text, '') FROM "ReplyDraft")
      )) AS stamp
    `;
    return rows[0]?.stamp ?? "";
  },
};
