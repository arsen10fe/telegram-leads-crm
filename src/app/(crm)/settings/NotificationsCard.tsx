"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ExternalLink, LoaderCircle, Unlink } from "lucide-react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/crm/RelativeTime";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createTelegramLinkAction, unlinkTelegramAction } from "./actions";

const LINK_POLL_MS = 3_000;
const LINK_POLL_LIMIT_MS = 3 * 60_000;

export function NotificationsCard({ linked, linkedAt }: { linked: boolean; linkedAt: Date | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  // While the manager is pressing Start in Telegram, refresh the page to pick up the new status.
  useEffect(() => {
    if (!linkUrl || linked) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > LINK_POLL_LIMIT_MS) clearInterval(timer);
      else router.refresh();
    }, LINK_POLL_MS);
    return () => clearInterval(timer);
  }, [linkUrl, linked, router]);

  function connect() {
    startTransition(async () => {
      const result = await createTelegramLinkAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setLinkUrl(result.data.url);
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  function disconnect() {
    startTransition(async () => {
      const result = await unlinkTelegramAction();
      if (!result.ok) toast.error(result.error.message);
      else toast.success("Уведомления отключены");
      setLinkUrl(null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Уведомления в Telegram</CardTitle>
        <CardDescription>
          Новые лиды и передачи диалога от AI-ассистента — в ваш личный чат с ботом, с кнопкой «Открыть в CRM».
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {linked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <BellRing className="size-4 text-green-600" />
              Подключено{" "}
              {linkedAt ? (
                <span className="text-muted-foreground">
                  · <RelativeTime date={linkedAt} />
                </span>
              ) : null}
            </span>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={pending}>
              <Unlink />
              Отключить
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div>
              <Button onClick={connect} disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : <BellRing />}
                Подключить
              </Button>
            </div>
            {linkUrl ? (
              <p className="text-muted-foreground">
                Откройте бота и нажмите «Start». Если окно не открылось —{" "}
                <a href={linkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  ссылка
                  <ExternalLink className="size-3.5" />
                </a>
                . Ссылка действует час.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
