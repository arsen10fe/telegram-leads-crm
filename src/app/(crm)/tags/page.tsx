import type { Metadata } from "next";
import { Tags } from "lucide-react";
import { EmptyState } from "@/components/crm/EmptyState";
import { PageHeader } from "@/components/crm/PageHeader";
import { leads } from "@/modules/leads";
import { TagsManager } from "./TagsManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Теги" };

export default async function TagsPage() {
  const tags = await leads.listTagsWithCounts();

  return (
    <>
      <PageHeader
        title="Теги"
        description="Справочник тегов. AI ставит теги только из этого списка; клик по числу лидов открывает их в списке."
      />
      {tags.length === 0 ? (
        <>
          <TagsManager tags={[]} />
          <EmptyState icon={<Tags />} title="Тегов пока нет" description="Создайте первый тег выше." />
        </>
      ) : (
        <TagsManager tags={tags} />
      )}
    </>
  );
}
