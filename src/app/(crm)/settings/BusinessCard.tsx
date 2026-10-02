import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { RelativeTime } from "@/components/crm/RelativeTime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessConnectionRecord } from "@/modules/channels";

function ConnectionStatus({ connection }: { connection: BusinessConnectionRecord }) {
  const healthy = connection.isEnabled && connection.canReply;
  const Icon = healthy ? CircleCheck : connection.isEnabled ? CircleDashed : CircleX;
  const owner = connection.ownerUsername ? `@${connection.ownerUsername}` : (connection.ownerName ?? "аккаунт");
  return (
    <div className="flex items-start gap-2 rounded-md border p-3 text-sm">
      <Icon className={healthy ? "mt-0.5 size-4 text-green-600" : "mt-0.5 size-4 text-amber-600"} />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">
          {owner}
          {connection.ownerName && connection.ownerUsername ? ` · ${connection.ownerName}` : null}
        </span>
        <span className="text-muted-foreground">
          {connection.isEnabled ? "подключён" : "отключён"} ·{" "}
          {connection.canReply ? "может отвечать от имени аккаунта" : "нет права отвечать (can_reply)"} · обновлено{" "}
          <RelativeTime date={connection.updatedAt} />
        </span>
      </div>
    </div>
  );
}

export function BusinessCard({ connections, botUsername }: { connections: BusinessConnectionRecord[]; botUsername?: string }) {
  const bot = botUsername ? `@${botUsername}` : "бота агентства";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Telegram Business</CardTitle>
        <CardDescription>
          Личный Telegram менеджера как источник лидов: новые чаты появляются в CRM, ответы уходят от имени аккаунта.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connections.length > 0 ? (
          <div className="flex flex-col gap-2">
            {connections.map((connection) => (
              <ConnectionStatus key={connection.id} connection={connection} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Пока ни один аккаунт не подключён.</p>
        )}
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">Как подключить</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
            <li>В @BotFather у {bot} включите Secretary Mode (раньше назывался Business Mode).</li>
            <li>
              В Telegram с Premium-аккаунта: Настройки → Telegram Business → Чат-боты → добавьте {bot}.
            </li>
            <li>Доступ — «Новые чаты» и «Не контакты»: переписка с друзьями и коллегами не попадёт в CRM.</li>
            <li>Готово: подключение появится выше, а новые чаты — в списке лидов с источником «Telegram (личный)».</li>
          </ol>
          <p className="text-muted-foreground">
            Ответить из CRM можно в течение 24 часов после последнего сообщения клиента — так устроен Telegram. По
            умолчанию для таких лидов включён копилот: AI готовит черновик, а отправляет менеджер.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
