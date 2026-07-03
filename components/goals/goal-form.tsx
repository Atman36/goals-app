"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { clientGoalSchema, type ClientGoalInput } from "@/components/goals/goal-form-schema";
import { createGoal, updateGoal } from "@/lib/actions/goals";
import { registerMedia } from "@/lib/actions/media";
import { CoverUpload, type CoverUploadResult } from "@/components/goals/cover-upload";
import { toMajorUnits } from "@/lib/utils/money";
import type { Currency } from "@/lib/validators/goal";
import type { GoalWithProgress } from "@/lib/db/queries/goals";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GoalFormProps =
  | { mode: "create"; kind: "financial" | "non_financial"; defaultCurrency: Currency }
  | { mode: "edit"; goal: GoalWithProgress; currencyLocked: boolean };

export function GoalForm(props: GoalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | undefined>();
  const [pendingCover, setPendingCover] = useState<CoverUploadResult | undefined>();

  const kind = props.mode === "create" ? props.kind : props.goal.kind;

  const defaultValues: ClientGoalInput =
    props.mode === "edit"
      ? {
          kind: props.goal.kind,
          title: props.goal.title,
          description: props.goal.description ?? "",
          deadline: props.goal.deadline,
          currencySymbol: props.goal.currency ?? undefined,
          targetAmountMajor:
            props.goal.targetAmount != null ? String(toMajorUnits(props.goal.targetAmount)) : "",
          initialAmountMajor:
            props.goal.initialAmount != null ? String(toMajorUnits(props.goal.initialAmount)) : "0",
        }
      : {
          kind: props.kind,
          title: "",
          description: "",
          deadline: "",
          currencySymbol: props.kind === "financial" ? props.defaultCurrency : undefined,
          targetAmountMajor: "",
          initialAmountMajor: "0",
        };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ClientGoalInput>({
    resolver: zodResolver(clientGoalSchema),
    defaultValues,
  });

  const currencySymbol = useWatch({ control, name: "currencySymbol" });
  const currencyDisabled = props.mode === "edit" && props.currencyLocked;

  const onSubmit = handleSubmit((values) => {
    setFormError(undefined);

    startTransition(async () => {
      const result =
        props.mode === "edit"
          ? await updateGoal({ ...values, id: props.goal.id })
          : await createGoal(values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      if (pendingCover) {
        await registerMedia({
          goalId: result.goalId,
          path: pendingCover.path,
          setAsCover: true,
        });
      }

      // Both create and edit land on the goal page (PRD §3.2) — the action
      // already called revalidatePath for it, so this navigation picks up
      // fresh data.
      router.push(`/goals/${result.goalId}`);
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <input type="hidden" {...register("kind")} />
      <input type="hidden" {...register("currencySymbol")} />

      <CoverUpload
        goalId={props.mode === "edit" ? props.goal.id : undefined}
        onFileReady={setPendingCover}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Название</Label>
        <Input id="title" placeholder="Например: Отпуск на море" {...register("title")} />
        {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
      </div>

      {kind === "financial" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label>Валюта</Label>
            <div className="flex gap-2">
              {(["RUB", "USD"] as const).map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant={currencySymbol === c ? "default" : "outline"}
                  disabled={currencyDisabled}
                  onClick={() => setValue("currencySymbol", c, { shouldValidate: true })}
                >
                  {c === "RUB" ? "₽" : "$"}
                </Button>
              ))}
            </div>
            {currencyDisabled ? (
              <p className="text-xs text-muted-foreground">
                По цели уже есть взносы — валюту нельзя изменить.
              </p>
            ) : null}
            {errors.currencySymbol ? (
              <p className="text-sm text-destructive">{errors.currencySymbol.message}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="targetAmountMajor">Стоимость цели</Label>
              <Input
                id="targetAmountMajor"
                inputMode="numeric"
                placeholder="100000"
                {...register("targetAmountMajor")}
              />
              {errors.targetAmountMajor ? (
                <p className="text-sm text-destructive">{errors.targetAmountMajor.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="initialAmountMajor">Уже накоплено</Label>
              <Input
                id="initialAmountMajor"
                inputMode="numeric"
                placeholder="0"
                {...register("initialAmountMajor")}
              />
              {errors.initialAmountMajor ? (
                <p className="text-sm text-destructive">{errors.initialAmountMajor.message}</p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="deadline">Дедлайн</Label>
        <Input id="deadline" type="date" {...register("deadline")} />
        {errors.deadline ? (
          <p className="text-sm text-destructive">{errors.deadline.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Описание</Label>
        <textarea
          id="description"
          rows={4}
          placeholder="Опционально"
          className={cn(
            "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "dark:bg-input/30",
          )}
          {...register("description")}
        />
        {errors.description ? (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        ) : null}
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняем…" : props.mode === "edit" ? "Сохранить" : "Создать цель"}
      </Button>
    </form>
  );
}
