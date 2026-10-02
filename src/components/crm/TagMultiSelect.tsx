"use client";

import { useState, type ReactNode } from "react";
import { Plus, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { tagColorClasses } from "./tag-colors";

export type TagOption = { id: string; name: string; color: string };

export function TagMultiSelect({
  tags,
  value,
  onChange,
  onCreate,
  trigger,
  placeholder = "Теги",
  align = "start",
}: {
  tags: TagOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** When set, typing an unknown name offers «Создать тег …». */
  onCreate?: (name: string) => void;
  trigger?: ReactNode;
  placeholder?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = new Set(value);
  const query = search.trim();
  const exactMatch = tags.some((tag) => tag.name.toLowerCase() === query.toLowerCase());

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((tagId) => tagId !== id) : [...value, id]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className={cn("justify-start", value.length > 0 && "border-primary/40")}>
            <Tags />
            {value.length > 0 ? `${placeholder}: ${value.length}` : placeholder}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Найти тег…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Тегов не найдено</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => (
                <CommandItem
                  key={tag.id}
                  value={tag.name}
                  data-checked={selected.has(tag.id)}
                  onSelect={() => toggle(tag.id)}
                >
                  <span className={cn("size-2.5 rounded-full", tagColorClasses(tag.color).dot)} aria-hidden />
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && query && !exactMatch ? (
              <CommandGroup>
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={() => {
                    onCreate(query);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Plus />
                  Создать тег «{query}»
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
