import type { Metadata } from "next";
import { PageHeader } from "@/components/crm/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ai } from "@/modules/ai";
import { channels } from "@/modules/channels";
import { KNOWLEDGE_BASE_MAX_LENGTH, settings } from "@/modules/settings";
import { getEnv } from "@/shared/env";
import { requireSession } from "../../_lib/session";
import { AgencyProfileForm } from "./AgencyProfileForm";
import { AiSettingsForm } from "./AiSettingsForm";
import { BusinessCard } from "./BusinessCard";
import { NotificationsCard } from "./NotificationsCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const [{ user }, agency, connections] = await Promise.all([
    requireSession(),
    settings.get(),
    channels.listBusinessConnections(),
  ]);
  const botUsername = getEnv().TELEGRAM_BOT_USERNAME;

  return (
    <>
      <PageHeader title="Настройки" description="Профиль агентства, каналы и поведение AI." />
      <div className="flex max-w-4xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Агентство и база знаний</CardTitle>
            <CardDescription>Отсюда AI берёт факты для квалификации, черновиков и ответов клиентам.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* key: re-mount with fresh values after a save or an edit made elsewhere */}
            <AgencyProfileForm
              key={agency.updatedAt.toISOString()}
              agencyName={agency.agencyName}
              knowledgeBase={agency.knowledgeBase}
              maxLength={KNOWLEDGE_BASE_MAX_LENGTH}
            />
          </CardContent>
        </Card>

        <BusinessCard connections={connections} botUsername={botUsername} />

        <NotificationsCard linked={user.telegramLinked} linkedAt={user.telegramLinkedAt} />

        <AiSettingsForm
          key={agency.updatedAt.toISOString()}
          initial={{
            defaultAiModeBot: agency.defaultAiModeBot,
            defaultAiModeBusiness: agency.defaultAiModeBusiness,
            autopilotMaxTurns: agency.autopilotMaxTurns,
            minConfidence: agency.minConfidence,
            triggerWords: agency.triggerWords,
          }}
          aiEnabled={ai.isEnabled()}
          models={ai.models()}
        />
      </div>
    </>
  );
}
