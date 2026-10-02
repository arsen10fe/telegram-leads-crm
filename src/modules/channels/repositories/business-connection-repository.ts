import { db } from "@/shared/db";
import type { BusinessConnectionRecord } from "../models/business-connection";

export type BusinessConnectionInput = Omit<BusinessConnectionRecord, "updatedAt">;

export const businessConnectionRepository = {
  find(id: string): Promise<BusinessConnectionRecord | null> {
    return db.businessConnection.findUnique({ where: { id } });
  },

  upsert(input: BusinessConnectionInput): Promise<BusinessConnectionRecord> {
    const { id, ...fields } = input;
    return db.businessConnection.upsert({ where: { id }, create: input, update: fields });
  },

  listRecent(limit = 5): Promise<BusinessConnectionRecord[]> {
    return db.businessConnection.findMany({ orderBy: { updatedAt: "desc" }, take: limit });
  },

  /** Changes when a connection is added or its rights change: reply availability depends on it. */
  async changeStamp(): Promise<string> {
    const { _count, _max } = await db.businessConnection.aggregate({
      _count: { _all: true },
      _max: { updatedAt: true },
    });
    return `${_count._all}:${_max.updatedAt?.toISOString() ?? ""}`;
  },
};
