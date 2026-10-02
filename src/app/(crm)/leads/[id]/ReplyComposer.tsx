"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw, SendHorizontal, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { rejectDraftAction, sendDraftAction, sendReplyAction, suggestReplyAction } from "./actions";

const MAX_LENGTH = 4_000;

type Draft = { id: string; text: string; noteForManager: string | null };

export type CopilotState = {
  enabled: boolean;
  /** The lead's pending draft, as the server sees it right now. */
  draft: Draft | null;
  /** The latest draft went stale because the client wrote again. */
  staleDraft: boolean;
};

type ActionOutcome = { ok: true } | { ok: false; error: { message: string } };

/**
 * The manager's reply box, with copilot drafts inside it: a draft fills the text area, the manager
 * edits and sends it. The typed text is local state and survives the page's auto-refresh; a draft
 * only counts while the server still reports it as pending.
 */
export function ReplyComposer({
  leadId,
  disabledReason,
  hint,
  copilot,
}: {
  leadId: string;
  disabledReason?: string | null;
  hint?: string | null;
  copilot: CopilotState;
}) {
  const [draft, setDraft] = useState<Draft | null>(copilot.draft);
  const [text, setText] = useState(copilot.draft?.text ?? "");
  const [pending, startTransition] = useTransition();
  const [suggesting, startSuggesting] = useTransition();
  // The client may have written again: the draft is superseded, but the manager keeps their text
  // and it goes out as a normal reply.
  const activeDraft = draft && copilot.draft?.id === draft.id ? draft : null;
  const draftWentStale = draft !== null && activeDraft === null;

  function clear() {
    setText("");
    setDraft(null);
  }

  function run(task: () => Promise<ActionOutcome>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      onSuccess?.();
    });
  }

  function suggest() {
    startSuggesting(async () => {
      const result = await suggestReplyAction(leadId);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setDraft(result.data);
      setText(result.data.text);
    });
  }

  function send() {
    const message = text.trim();
    if (!message || pending) return;
    const onSent = () => {
      clear();
      toast.success("Отправлено");
    };
    if (activeDraft) {
      run(() => sendDraftAction({ draftId: activeDraft.id, text: message }), onSent);
      return;
    }
    run(() => sendReplyAction({ leadId, text: message }), onSent);
  }

  if (disabledReason) {
    return <div className="border-t bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{disabledReason}</div>;
  }

  const busy = pending || suggesting;

  return (
    <div className="flex flex-col gap-2 border-t px-4 py-3">
      {activeDraft ? (
        <div className="flex flex-col gap-1 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <span className="flex items-center gap-1.5 font-medium">
            <Sparkles className="size-4" />
            Черновик AI — отредактируйте и отправьте
          </span>
          {activeDraft.noteForManager ? <span className="text-violet-800/80">Заметка: {activeDraft.noteForManager}</span> : null}
        </div>
      ) : draftWentStale ? (
        <p className="text-xs text-muted-foreground">Клиент написал ещё — черновик устарел, текст сохранён.</p>
      ) : copilot.staleDraft ? (
        <p className="text-xs text-muted-foreground">Клиент написал ещё — прошлый черновик устарел.</p>
      ) : null}
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send();
        }}
        placeholder="Ответ клиенту в Telegram…"
        maxLength={MAX_LENGTH}
        rows={activeDraft ? 5 : 3}
        disabled={busy}
        className="resize-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{hint ?? "Ctrl/⌘ + Enter — отправить"}</span>
        <div className="flex flex-wrap items-center gap-2">
          {activeDraft ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run(() => rejectDraftAction({ leadId, draftId: activeDraft.id }), clear)}
              >
                <X />
                Отклонить
              </Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={suggest}>
                {suggesting ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                Ещё вариант
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !copilot.enabled}
              onClick={suggest}
              title={copilot.enabled ? undefined : "AI выключен"}
            >
              {suggesting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {copilot.enabled ? "Предложить ответ" : "AI выключен"}
            </Button>
          )}
          <Button onClick={send} disabled={busy || !text.trim()} size="sm">
            {pending ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
            Отправить
          </Button>
        </div>
      </div>
    </div>
  );
}
