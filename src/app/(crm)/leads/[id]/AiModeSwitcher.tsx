"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AI_MODE_DESCRIPTIONS, AI_MODE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { setAiModeAction } from "./actions";

const MODES = ["autopilot", "copilot", "off"] as const;

export function AiModeSwitcher({ leadId, mode, hasChannel }: { leadId: string; mode: string; hasChannel: boolean }) {
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    startTransition(async () => {
      const result = await setAiModeAction({ leadId, mode: next });
      if (!result.ok) toast.error(result.error.message);
      else toast.success(`Режим: ${AI_MODE_LABELS[next]}`);
    });
  }

  return (
    <RadioGroup value={mode} onValueChange={onChange} disabled={pending} className="gap-3">
      {MODES.map((value) => {
        const disabled = value === "autopilot" && !hasChannel;
        return (
          <div key={value} className={cn("flex items-start gap-2.5", disabled && "opacity-50")}>
            <RadioGroupItem value={value} id={`ai-mode-${value}`} disabled={disabled} className="mt-0.5" />
            <Label htmlFor={`ai-mode-${value}`} className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">{AI_MODE_LABELS[value]}</span>
              <span className="text-xs text-muted-foreground">
                {disabled ? "Недоступно: у лида нет канала связи в Telegram." : AI_MODE_DESCRIPTIONS[value]}
              </span>
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
