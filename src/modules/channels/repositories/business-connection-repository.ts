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
};
