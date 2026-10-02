"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { TagBadge } from "@/components/crm/badges";
import { TagColorPicker } from "@/components/crm/TagColorPicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countRu } from "@/lib/format";
import { createTagAction, deleteTagAction, updateTagAction } from "./actions";

type TagRowData = { id: string; name: string; color: string; leadCount: number };

const LEAD_FORMS = ["лид", "лида", "лидов"] as const;

function NewTagForm() {
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createTagAction({ name, color });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Тег «${name.trim()}» создан`);
      setName("");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Новый тег, например «Интернет-магазин»"
        maxLength={40}
        className="w-full sm:w-72"
        aria-label="Название тега"
      />
      <TagColorPicker value={color} onChange={setColor} />
      <Button type="submit" disabled={pending || !name.trim()}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
        Добавить
      </Button>
    </form>
  );
}

function TagRow({ tag }: { tag: TagRowData }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateTagAction(tag.id, { name, color });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTagAction(tag.id);
      if (!result.ok) toast.error(result.error.message);
      else toast.success(`Тег «${tag.name}» удалён`);
    });
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={2}>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              className="w-56"
              aria-label="Название тега"
              autoFocus
            />
            <TagColorPicker value={color} onChange={setColor} />
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button size="sm" onClick={save} disabled={pending || !name.trim()}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              Сохранить
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setName(tag.name);
                setColor(tag.color);
                setEditing(false);
              }}
            >
              <X />
              Отмена
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <TagBadge name={tag.name} color={tag.color} />
      </TableCell>
      <TableCell>
        {tag.leadCount > 0 ? (
          <Link href={`/leads?tag=${tag.id}`} className="underline-offset-4 hover:underline">
            {countRu(tag.leadCount, LEAD_FORMS)}
          </Link>
        ) : (
          <span className="text-muted-foreground">нет лидов</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Изменить тег ${tag.name}`}>
            <Pencil />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={`Удалить тег ${tag.name}`}>
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить тег «{tag.name}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  {tag.leadCount > 0
                    ? `Тег снимется с ${countRu(tag.leadCount, LEAD_FORMS)}. Сами лиды останутся.`
                    : "Тег не назначен ни одному лиду."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Удалить</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TagsManager({ tags }: { tags: TagRowData[] }) {
  return (
    <>
      <NewTagForm />
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тег</TableHead>
              <TableHead>Лиды</TableHead>
              <TableHead className="w-48 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              // key includes the values: an edit made elsewhere resets the local edit state
              <TagRow key={`${tag.id}:${tag.name}:${tag.color}`} tag={tag} />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
