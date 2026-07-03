"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveGoal, markAchieved, softDeleteGoalAction } from "@/lib/actions/goals";
import type { SimpleActionResult } from "@/lib/actions/goals";
import { Button } from "@/components/ui/button";

type GoalStatus = "active" | "achieved" | "archived";

// §8.3 requires UI confirmation on destructive/state-changing ops; a plain
// window.confirm() keeps this dependency-free (no AlertDialog) per spec.
export function GoalDangerActions({ goalId, status }: { goalId: string; status: GoalStatus }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function run(
    action: () => Promise<SimpleActionResult>,
    confirmMessage: string,
    onOk: () => void,
  ) {
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOk();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(
                () => markAchieved(goalId),
                "Отметить цель достигнутой?",
                () => router.push(`/goals/${goalId}`),
              )
            }
          >
            Отметить достигнутой
          </Button>
        ) : null}
        {status !== "archived" ? (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              run(
                () => archiveGoal(goalId),
                "Архивировать цель?",
                () => router.push(`/goals/${goalId}`),
              )
            }
          >
            Архивировать
          </Button>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            run(
              () => softDeleteGoalAction(goalId),
              "Удалить цель? Это действие нельзя отменить в интерфейсе.",
              () => router.push("/"),
            )
          }
        >
          Удалить
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
