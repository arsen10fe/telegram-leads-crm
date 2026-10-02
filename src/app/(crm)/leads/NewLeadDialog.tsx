"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { TagBadge } from "@/components/crm/badges";
import { TagMultiSelect, type TagOption } from "@/components/crm/TagMultiSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLeadAction } from "./actions";

export function NewLeadDialog({ tags }: { tags: TagOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createLeadAction({
        name: String(form.get("name") ?? ""),
        contact: String(form.get("contact") ?? ""),
        request: String(form.get("request") ?? ""),
        tagIds,
      });
      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        toast.error(result.error.message);
        return;
      }
      toast.success("Лид создан");
      setOpen(false);
      setTagIds([]);
      setFieldErrors({});
      router.push(`/leads/${result.data.leadId}`);
    });
  }

  const selectedTags = tags.filter((tag) => tagIds.includes(tag.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Новый лид
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый лид</DialogTitle>
          <DialogDescription>Например, клиент позвонил или пришёл по рекомендации.</DialogDescription>
        </DialogHeader>
        <form id="new-lead-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-name">Имя *</Label>
            <Input id="lead-name" name="name" required minLength={2} maxLength={100} aria-invalid={!!fieldErrors.name} />
            {fieldErrors.name ? <p className="text-sm text-destructive">{fieldErrors.name[0]}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-contact">Контакт</Label>
            <Input
              id="lead-contact"
              name="contact"
              maxLength={100}
              placeholder="+7 999 123-45-67, @username или e-mail"
              aria-invalid={!!fieldErrors.contact}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-request">Запрос</Label>
            <Textarea id="lead-request" name="request" maxLength={2000} rows={4} placeholder="Что нужно клиенту" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Теги</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {selectedTags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  name={tag.name}
                  color={tag.color}
                  onRemove={() => setTagIds(tagIds.filter((id) => id !== tag.id))}
                />
              ))}
              <TagMultiSelect
                tags={tags}
                value={tagIds}
                onChange={setTagIds}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <Plus />
                    Добавить тег
                  </Button>
                }
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button type="submit" form="new-lead-form" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
