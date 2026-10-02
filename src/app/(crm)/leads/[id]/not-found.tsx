import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/crm/EmptyState";
import { Button } from "@/components/ui/button";

/** An unknown or mistyped lead id (an old link, a deleted lead). */
export default function LeadNotFound() {
  return (
    <div className="rounded-lg border bg-background">
      <EmptyState
        icon={<SearchX />}
        title="Лид не найден"
        description="Возможно, ссылка устарела или в ней опечатка."
        action={
          <Button variant="outline" asChild>
            <Link href="/leads">Ко всем лидам</Link>
          </Button>
        }
      />
    </div>
  );
}
