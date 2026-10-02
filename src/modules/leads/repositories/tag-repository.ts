import type { Db } from "@/shared/db";

export const tagRepository = {
  create(client: Db, data: { name: string; nameKey: string; color: string }) {
    return client.tag.create({ data });
  },

  findById(client: Db, id: string) {
    return client.tag.findUnique({ where: { id } });
  },

  findByNameKey(client: Db, nameKey: string) {
    return client.tag.findUnique({ where: { nameKey } });
  },

  findManyByIds(client: Db, ids: string[]) {
    return client.tag.findMany({ where: { id: { in: ids } } });
  },

  listAll(client: Db) {
    return client.tag.findMany({ orderBy: { name: "asc" } });
  },

  /** Lead counts exclude AI tags the manager dismissed. */
  listWithCounts(client: Db) {
    return client.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { leads: { where: { dismissedAt: null } } } } },
    });
  },

  countLeads(client: Db, tagId: string) {
    return client.leadTag.count({ where: { tagId, dismissedAt: null } });
  },

  update(client: Db, id: string, data: { name?: string; nameKey?: string; color?: string }) {
    return client.tag.update({ where: { id }, data });
  },

  /** Assignments go away with the tag (onDelete: Cascade). */
  delete(client: Db, id: string) {
    return client.tag.delete({ where: { id } });
  },
};
