"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setFocusGoal, clearFocusGoal } from "@/lib/actions/focus";

/** Goal page's set/unset control for "цель №1" (T4). Only rendered for active
 *  goals (T3's action rejects non-active goals). Mirrors woop-block.tsx's
 *  useTransition + server-action pattern; router.refresh() re-reads the
 *  server components after the action's own revalidatePath resolves. */
export function FocusToggle({ goalId, isFocus }: { goalId: string; isFocus: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSet() {
    startTransition(async () => {
      const r = await setFocusGoal(goalId);
      if (r.ok) router.refresh();
    });
  }

  function handleClear() {
    startTransition(async () => {
      const r = await clearFocusGoal();
      if (r.ok) router.refresh();
    });
  }

  if (!isFocus) {
    return (
      <Button variant="outline" disabled={isPending} onClick={handleSet}>
        <Star /> Сделать целью №1
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Star /> Цель №1
      </span>
      <Button variant="ghost" size="sm" disabled={isPending} onClick={handleClear}>
        <StarOff /> Снять фокус
      </Button>
    </div>
  );
}
