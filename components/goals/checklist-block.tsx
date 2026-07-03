"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressRing } from "@/components/goals/progress-ring";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/lib/db/schema";

type GoalKind = "financial" | "non_financial";
type ChecklistKind = "action" | "document" | "purchase" | "agreement" | "if_then";

const KIND_LABEL: Record<ChecklistKind, string> = {
  action: "Действие",
  document: "Документ",
  purchase: "Покупка",
  agreement: "Договорённость",
  if_then: "Если-то",
};

// Structured if-then form is Phase 2 — MVP only offers these 4 plain kinds.
const MVP_KINDS: ChecklistKind[] = ["action", "document", "purchase", "agreement"];

export interface ClientChecklistItem {
  id: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  kind: ChecklistKind;
  isDone: boolean;
}

interface ChecklistApiItem {
  id: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  kind: ChecklistKind;
  isDone: boolean;
}

export function checklistQueryKey(goalId: string) {
  return ["checklist", goalId] as const;
}

function toClientItem(row: ChecklistItem): ClientChecklistItem {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    dueDate: row.dueDate,
    kind: row.kind,
    isDone: row.isDone,
  };
}

async function fetchChecklist(goalId: string): Promise<ClientChecklistItem[]> {
  const res = await fetch(`/api/v1/goals/${goalId}/checklist`);
  if (!res.ok) throw new Error("Не удалось загрузить чек-лист");
  const json = (await res.json()) as { data: ChecklistApiItem[] };
  return json.data.map((row) => ({
    id: row.id,
    title: row.title,
    note: row.note,
    dueDate: row.dueDate,
    kind: row.kind,
    isDone: row.isDone,
  }));
}

export function useChecklistQuery(goalId: string, initialItems: ChecklistItem[]) {
  return useQuery({
    queryKey: checklistQueryKey(goalId),
    queryFn: () => fetchChecklist(goalId),
    initialData: () => initialItems.map(toClientItem),
    // See contribution-history.tsx's useContributionsQuery for why this skips
    // the refetch-on-mount that would otherwise duplicate the SSR fetch.
    staleTime: 30_000,
  });
}

/** Right-column ring + metric for the checklist — the primary progress
 *  driver for non-financial goals ("{done} из {total} шагов"), a secondary
 *  "Готовность" line for financial ones (PRD §3.3/§4). Reactive to the same
 *  query cache ChecklistBlock's toggle/add/delete mutations write to. */
export function ChecklistProgressHeader({
  goalId,
  goalKind,
  initialItems,
}: {
  goalId: string;
  goalKind: GoalKind;
  initialItems: ChecklistItem[];
}) {
  const { data: items } = useChecklistQuery(goalId, initialItems);
  const total = items.length;
  const done = items.filter((i) => i.isDone).length;
  const percent = total > 0 ? done / total : 0;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
      <ProgressRing progress={percent} size={140} strokeWidth={14} />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          {goalKind === "non_financial" ? "Шаги" : "Готовность"}
        </span>
        <span className="font-display text-xl font-bold">
          {done} из {total}
        </span>
      </div>
    </div>
  );
}

export function ChecklistBlock({
  goalId,
  goalKind,
  initialItems,
}: {
  goalId: string;
  goalKind: GoalKind;
  initialItems: ChecklistItem[];
}) {
  const queryClient = useQueryClient();
  const { data: items } = useChecklistQuery(goalId, initialItems);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ChecklistKind>("action");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [formError, setFormError] = useState<string | undefined>();

  const total = items.length;
  const done = items.filter((i) => i.isDone).length;

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isDone }: { id: string; isDone: boolean }) => {
      const res = await fetch(`/api/v1/checklist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDone }),
      });
      if (!res.ok) throw new Error("Не удалось обновить пункт");
      return res.json();
    },
    onMutate: async ({ id, isDone }) => {
      await queryClient.cancelQueries({ queryKey: checklistQueryKey(goalId) });
      const previous = queryClient.getQueryData<ClientChecklistItem[]>(checklistQueryKey(goalId));
      queryClient.setQueryData<ClientChecklistItem[]>(checklistQueryKey(goalId), (old) =>
        (old ?? []).map((item) => (item.id === id ? { ...item, isDone } : item)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(checklistQueryKey(goalId), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: checklistQueryKey(goalId) });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (input: { title: string; kind: ChecklistKind; note?: string; dueDate?: string }) => {
      const res = await fetch(`/api/v1/goals/${goalId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Не удалось добавить пункт");
      return res.json() as Promise<{ data: ChecklistApiItem }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<ClientChecklistItem[]>(checklistQueryKey(goalId), (old) => [
        ...(old ?? []),
        {
          id: result.data.id,
          title: result.data.title,
          note: result.data.note,
          dueDate: result.data.dueDate,
          kind: result.data.kind,
          isDone: result.data.isDone,
        },
      ]);
      setTitle("");
      setNote("");
      setDueDate("");
      setKind("action");
      setFormError(undefined);
    },
    onError: () => setFormError("Не удалось добавить пункт. Попробуйте ещё раз."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/checklist/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Не удалось удалить пункт");
      return res.json();
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: checklistQueryKey(goalId) });
      const previous = queryClient.getQueryData<ClientChecklistItem[]>(checklistQueryKey(goalId));
      queryClient.setQueryData<ClientChecklistItem[]>(checklistQueryKey(goalId), (old) =>
        (old ?? []).filter((item) => item.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(checklistQueryKey(goalId), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: checklistQueryKey(goalId) });
    },
  });

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Введите название шага");
      return;
    }
    addMutation.mutate({
      title: title.trim(),
      kind,
      note: note.trim() || undefined,
      dueDate: dueDate || undefined,
    });
  }

  function handleDelete(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Удалить шаг?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-heading text-base font-medium">
        {goalKind === "non_financial" ? `${done} из ${total} шагов` : `Готовность: ${done}/${total}`}
      </h3>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет шагов.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60"
            >
              <button
                type="button"
                aria-pressed={item.isDone}
                aria-label={item.isDone ? "Отметить невыполненным" : "Отметить выполненным"}
                onClick={() => toggleMutation.mutate({ id: item.id, isDone: !item.isDone })}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-[7px] border-2 border-foreground/25 transition-colors",
                  item.isDone && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {item.isDone ? <Check className="size-3.5" /> : null}
              </button>
              <div className="flex flex-1 flex-col">
                <span className={cn(item.isDone && "text-muted-foreground line-through")}>{item.title}</span>
                {item.note ? <span className="text-xs text-muted-foreground">{item.note}</span> : null}
              </div>
              {item.dueDate ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(parseISO(item.dueDate), "d MMM", { locale: ru })}
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Удалить шаг"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAddSubmit} className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3">
        <div className="flex gap-2">
          <Input
            placeholder="Новый шаг"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1"
          />
          <select
            aria-label="Тип шага"
            value={kind}
            onChange={(e) => setKind(e.target.value as ChecklistKind)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {MVP_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Заметка (опционально)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="flex-1"
          />
          <Input
            type="date"
            aria-label="Срок"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-40"
          />
        </div>
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <Button type="submit" variant="outline" className="self-start" disabled={addMutation.isPending}>
          <Plus className="size-4" /> Добавить шаг
        </Button>
      </form>
    </div>
  );
}
