"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_COLOR_CLASSES, UI_TAG_COLORS } from "./tag-colors";

export function TagColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Цвет тега">
      {UI_TAG_COLORS.map((color) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={TAG_COLOR_CLASSES[color].label}
            title={TAG_COLOR_CLASSES[color].label}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full ring-offset-2 transition",
              TAG_COLOR_CLASSES[color].dot,
              selected ? "ring-2 ring-foreground/60" : "hover:scale-110",
            )}
          >
            {selected ? <Check className="size-3.5 text-white" /> : null}
          </button>
        );
      })}
    </div>
  );
}
