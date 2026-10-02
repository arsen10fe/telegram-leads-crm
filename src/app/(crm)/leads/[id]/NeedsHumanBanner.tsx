"use client";

import { useTransition } from "react";
import { Hand, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HANDOFF_REASON_LABELS, labelFor } from "@/lib/labels";
import { markHandledAction } from "./actions";

export function NeedsHumanBanner({ leadId, reason }: { leadId: string; reason: string | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900">
      <div className="flex items-start gap-2">
        <Hand className="mt-0.5 size-4 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Нужен менеджер</p>
          <p className="text-red-800/80">
            {reason ? `AI передал диалог: ${labelFor(HANDOFF_REASON_LABELS, reason)}.` : "Клиенту нужен ответ человека."}{" "}
            Автопилот для этого лида выключен.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-red-300 bg-white"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markHandledAction(leadId);
            if (!result.ok) toast.error(result.error.message);
          })
        }
      >
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Взял в работу
      </Button>
    </div>
  );
}
