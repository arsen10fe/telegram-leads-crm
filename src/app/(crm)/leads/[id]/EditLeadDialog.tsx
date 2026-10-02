"use client";

import { useState, useTransition, type FormEvent } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateLeadAction } from "./actions";

export function EditLeadDialog({
  leadId,
  name,
  contact,
  request,
}: {
  leadId: string;
  name: string;
  contact: string | null;
  request: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateLeadAction(leadId, {
        name: String(form.get("name") ?? ""),
        contact: String(form.get("contact") ?? ""),
        request: String(form.get("request") ?? ""),
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Сохранено");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil />
          Изменить
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Данные лида</DialogTitle>
        </DialogHeader>
        {/* key: fresh defaults every time the dialog opens */}
        <form key={String(open)} id="edit-lead-form" onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-name">Имя</Label>
            <Input id="edit-name" name="name" defaultValue={name} required minLength={2} maxLength={100} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-contact">Контакт</Label>
            <Input id="edit-contact" name="contact" defaultValue={contact ?? ""} maxLength={100} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-request">Запрос</Label>
            <Textarea id="edit-request" name="request" defaultValue={request ?? ""} maxLength={2000} rows={4} />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button type="submit" form="edit-lead-form" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
