"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TagBadge } from "@/components/crm/badges";
import { TagMultiSelect, type TagOption } from "@/components/crm/TagMultiSelect";
import { Button } from "@/components/ui/button";
import { assignTagAction, createTagAndAssignAction, removeTagAction } from "./actions";

type AssignedTag = TagOption & { origin: string; confidence: number | null };

export function LeadTagsEditor({ leadId, assigned, allTags }: { leadId: string; assigned: AssignedTag[]; allTags: TagOption[] }) {
  const [pending, startTransition] = useTransition();
  const assignedIds = assigned.map((tag) => tag.id);

  function run(task: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) toast.error(result.error?.message ?? "Не удалось изменить теги");
    });
  }

  function onChange(nextIds: string[]) {
    const added = nextIds.filter((id) => !assignedIds.includes(id));
    const removed = assignedIds.filter((id) => !nextIds.includes(id));
    for (const tagId of added) run(() => assignTagAction({ leadId, tagId }));
    for (const tagId of removed) run(() => removeTagAction({ leadId, tagId }));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-busy={pending}>
      {assigned.length === 0 ? <span className="text-sm text-muted-foreground">Тегов нет</span> : null}
      {assigned.map((tag) => (
        <TagBadge
          key={tag.id}
          name={tag.name}
          color={tag.color}
          origin={tag.origin}
          confidence={tag.confidence}
          onRemove={() => run(() => removeTagAction({ leadId, tagId: tag.id }))}
        />
      ))}
      <TagMultiSelect
        tags={allTags}
        value={assignedIds}
        onChange={onChange}
        onCreate={(name) => run(() => createTagAndAssignAction({ leadId, name }))}
        align="end"
        trigger={
          <Button type="button" variant="outline" size="xs" disabled={pending}>
            <Plus />
            Тег
          </Button>
        }
      />
    </div>
  );
}
