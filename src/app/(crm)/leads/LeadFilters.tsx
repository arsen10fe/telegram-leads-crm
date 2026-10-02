"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { TagBadge } from "@/components/crm/badges";
import { TagMultiSelect, type TagOption } from "@/components/crm/TagMultiSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SOURCE_LABELS } from "@/lib/labels";

export type LeadFilterValues = { tagIds: string[]; source: string | null; needsHuman: boolean; q: string };

const SEARCH_DEBOUNCE_MS = 300;

/** Filters live in the URL, so a filtered list can be shared or reloaded as is. */
export function LeadFilters({ tags, filters }: { tags: TagOption[]; filters: LeadFilterValues }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  const [lastSentQ, setLastSentQ] = useState(filters.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The URL changed from outside (the «Сбросить фильтры» link, browser Back): show it in the box.
  // Our own debounced search coming back must not overwrite what the manager is still typing.
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    if (filters.q !== lastSentQ) setQuery(filters.q);
  }

  function update(patch: Partial<LeadFilterValues>) {
    // Read the current URL, not a value captured by an earlier render (debounced calls run later).
    const params = new URLSearchParams(window.location.search);
    if (patch.tagIds) {
      params.delete("tag");
      patch.tagIds.forEach((id) => params.append("tag", id));
    }
    if (patch.source !== undefined) {
      if (patch.source) params.set("source", patch.source);
      else params.delete("source");
    }
    if (patch.needsHuman !== undefined) {
      if (patch.needsHuman) params.set("needsHuman", "1");
      else params.delete("needsHuman");
    }
    if (patch.q !== undefined) {
      if (patch.q.trim()) params.set("q", patch.q.trim());
      else params.delete("q");
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  function onSearchChange(value: string) {
    setQuery(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setLastSentQ(value.trim());
      update({ q: value });
    }, SEARCH_DEBOUNCE_MS);
  }

  function resetAll() {
    clearTimeout(searchTimer.current);
    setQuery("");
    setLastSentQ("");
    router.replace(pathname, { scroll: false });
  }

  const selectedTags = tags.filter((tag) => filters.tagIds.includes(tag.id));
  const hasFilters = filters.tagIds.length > 0 || filters.source !== null || filters.needsHuman || filters.q !== "";

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Имя или контакт"
            className="pl-8"
            aria-label="Поиск по имени или контакту"
          />
        </div>
        <TagMultiSelect tags={tags} value={filters.tagIds} onChange={(tagIds) => update({ tagIds })} />
        <Select value={filters.source ?? "all"} onValueChange={(value) => update({ source: value === "all" ? null : value })}>
          <SelectTrigger className="w-48" aria-label="Источник">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все источники</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-1">
          <Switch
            id="needs-human"
            checked={filters.needsHuman}
            onCheckedChange={(checked) => update({ needsHuman: checked })}
          />
          <Label htmlFor="needs-human" className="font-normal">
            Нужен менеджер
          </Label>
        </div>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <X />
            Сбросить
          </Button>
        ) : null}
      </div>
      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>Лиды с тегом:</span>
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              name={tag.name}
              color={tag.color}
              onRemove={() => update({ tagIds: filters.tagIds.filter((id) => id !== tag.id) })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
