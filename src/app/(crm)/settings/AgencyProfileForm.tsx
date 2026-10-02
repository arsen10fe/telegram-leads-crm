"use client";

import { useState, useTransition, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { updateAgencySettingsAction } from "./actions";

const numberFormatter = new Intl.NumberFormat("ru-RU");

export function AgencyProfileForm({
  agencyName,
  knowledgeBase,
  maxLength,
}: {
  agencyName: string;
  knowledgeBase: string;
  maxLength: number;
}) {
  const [name, setName] = useState(agencyName);
  const [kb, setKb] = useState(knowledgeBase);
  const [pending, startTransition] = useTransition();
  const isDirty = name !== agencyName || kb !== knowledgeBase;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateAgencySettingsAction({ agencyName: name, knowledgeBase: kb });
      if (!result.ok) toast.error(result.error.message);
      else toast.success("Настройки сохранены");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="agency-name">Название агентства</Label>
        <Input
          id="agency-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={80}
          required
          className="max-w-md"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor="knowledge-base">База знаний</Label>
          <span className={cn("text-xs text-muted-foreground", kb.length > maxLength && "text-destructive")}>
            {numberFormatter.format(kb.length)} / {numberFormatter.format(maxLength)}
          </span>
        </div>
        <Textarea
          id="knowledge-base"
          value={kb}
          onChange={(event) => setKb(event.target.value)}
          rows={18}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Услуги и цены «от», процесс работы, частые вопросы, что агентство не делает, тон общения. AI отвечает клиентам
          только по этому тексту и ничего не выдумывает сверх него.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pending || !isDirty || kb.length > maxLength}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
          Сохранить
        </Button>
      </div>
    </form>
  );
}
