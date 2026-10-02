"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { tagColorClasses } from "@/components/crm/tag-colors";
import { cn } from "@/lib/utils";
import { assignTagAction } from "./actions";

/** «AI предлагает: [тег] ＋» — one click adds the tag as the manager's own. */
export function AiTagHints({ leadId, hints }: { leadId: string; hints: Array<{ id: string; name: string; color: string }> }) {
  const [pending, startTransition] = useTransition();
  if (hints.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">AI предлагает:</span>
      {hints.map((tag) => (
        <button
          key={tag.id}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await assignTagAction({ leadId, tagId: tag.id });
              if (!result.ok) toast.error(result.error.message);
            })
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-xs transition hover:border-solid",
            tagColorClasses(tag.color).badge,
          )}
        >
          {tag.name}
          <Plus className="size-3" />
        </button>
      ))}
    </div>
  );
}
