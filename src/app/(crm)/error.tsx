"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/crm/EmptyState";
import { Button } from "@/components/ui/button";

// Server-side failures are logged by the services; the manager sees a generic message only.
export default function CrmError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Не удалось загрузить страницу"
      description="Что-то пошло не так. Попробуйте ещё раз — лиды и переписка в сохранности."
      action={
        <Button variant="outline" onClick={() => retry()}>
          <RotateCcw />
          Повторить
        </Button>
      }
    />
  );
}
