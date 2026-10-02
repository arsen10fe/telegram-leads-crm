"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { CircleCheck, CircleOff, LoaderCircle, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_MODE_LABELS } from "@/lib/labels";
import { updateAgencySettingsAction } from "./actions";

type AiSettings = {
  defaultAiModeBot: string;
  defaultAiModeBusiness: string;
  autopilotMaxTurns: number;
  minConfidence: number;
  triggerWords: string[];
};

const MODES = ["autopilot", "copilot", "off"] as const;

function ModeSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODES.map((mode) => (
          <SelectItem key={mode} value={mode}>
            {AI_MODE_LABELS[mode]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AiSettingsForm({
  initial,
  aiEnabled,
  models,
}: {
  initial: AiSettings;
  aiEnabled: boolean;
  models: { fast: string; smart: string };
}) {
  const [values, setValues] = useState(initial);
  const [newWord, setNewWord] = useState("");
  const [pending, startTransition] = useTransition();

  function addWord() {
    const word = newWord.trim();
    if (!word) return;
    setValues((current) => ({ ...current, triggerWords: [...current.triggerWords, word] }));
    setNewWord("");
  }

  function onWordKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addWord();
  }

  function save() {
    startTransition(async () => {
      const result = await updateAgencySettingsAction(values);
      if (!result.ok) toast.error(result.error.message);
      else toast.success("Настройки AI сохранены");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI</CardTitle>
        <CardDescription>Как AI работает с новыми лидами и когда передаёт диалог менеджеру.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {aiEnabled ? (
            <span className="flex items-center gap-1.5">
              <CircleCheck className="size-4 text-green-600" /> AI включён
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CircleOff className="size-4" /> AI выключен на сервере (AI_ENABLED=false) — лиды и теги работают без него
            </span>
          )}
          <span className="text-muted-foreground">
            · модели: {models.fast} (квалификация), {models.smart} (ответы)
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mode-bot">Режим для лидов из бота</Label>
            <ModeSelect id="mode-bot" value={values.defaultAiModeBot} onChange={(v) => setValues({ ...values, defaultAiModeBot: v })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mode-business">Режим для лидов из личного Telegram</Label>
            <ModeSelect
              id="mode-business"
              value={values.defaultAiModeBusiness}
              onChange={(v) => setValues({ ...values, defaultAiModeBusiness: v })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="max-turns">Ответов автопилота на лида за 24 часа</Label>
            <Input
              id="max-turns"
              type="number"
              min={1}
              max={20}
              value={values.autopilotMaxTurns}
              onChange={(event) => setValues({ ...values, autopilotMaxTurns: Number(event.target.value) })}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="min-confidence">Минимальная уверенность AI, %</Label>
            <Input
              id="min-confidence"
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round(values.minConfidence * 100)}
              onChange={(event) => setValues({ ...values, minConfidence: Number(event.target.value) / 100 })}
              className="w-28"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="trigger-word">Стоп-слова — сразу передать менеджеру</Label>
          <div className="flex flex-wrap gap-1.5">
            {values.triggerWords.map((word, index) => (
              <Badge key={`${word}-${index}`} variant="secondary" className="gap-1 font-normal">
                {word}
                <button
                  type="button"
                  aria-label={`Убрать ${word}`}
                  onClick={() =>
                    setValues({ ...values, triggerWords: values.triggerWords.filter((_, i) => i !== index) })
                  }
                  className="opacity-60 hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              id="trigger-word"
              value={newWord}
              onChange={(event) => setNewWord(event.target.value)}
              onKeyDown={onWordKeyDown}
              placeholder="например, «смет*» или «жив* человек*»"
              maxLength={40}
              className="w-72"
            />
            <Button type="button" variant="outline" onClick={addWord} disabled={!newWord.trim()}>
              Добавить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            «слово*» — все формы слова (договор, договора, договором). Фраза — слова подряд, звёздочка работает
            и в ней: «жив* человек*» поймает «с живым человеком».
            Вопросы о цене сюда не нужны: автопилот отвечает ценами «от» из базы знаний.
          </p>
        </div>

        <div>
          <Button onClick={save} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
