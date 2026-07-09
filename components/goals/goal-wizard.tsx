"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import { ListChecks, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoalForm } from "@/components/goals/goal-form";
import { WizardConcordanceStep } from "@/components/goals/wizard-concordance-step";
import { WizardWoopStep } from "@/components/goals/wizard-woop-step";
import { createGoal } from "@/lib/actions/goals";
import { registerMedia } from "@/lib/actions/media";
import type { CoverUploadResult } from "@/components/goals/cover-upload";
import type { ClientGoalInput } from "@/components/goals/goal-form-schema";
import type { SelfConcordanceAnswers } from "@/lib/utils/concordance";
import type { WoopInput } from "@/lib/validators/woop";
import type { Currency } from "@/lib/validators/goal";
import type { GoalTemplate } from "@/lib/goal-templates";

type GoalKind = "financial" | "non_financial";

const KIND_CARDS: {
  kind: GoalKind;
  title: string;
  description: string;
  Icon: typeof Wallet;
}[] = [
  {
    kind: "financial",
    title: "Финансовая",
    description: "Сумма, валюта и срок — прогресс по накоплениям.",
    Icon: Wallet,
  },
  {
    kind: "non_financial",
    title: "Нефинансовая",
    description: "Срок и чек-лист шагов — прогресс по выполненным пунктам.",
    Icon: ListChecks,
  },
];

/** Step 0 (kind) → step 1 (basics via GoalForm, collected not submitted) →
 *  step 2 (self-concordance check) → step 3 (WOOP; creates the goal via
 *  lib/actions/goals.ts's createGoal with the composite payload) — PRD §3.2
 *  Phase 2 "Методология v1". Creation is deferred to the wizard's end so
 *  goal_created's has_woop/has_concordance flags are truthful. No checklist
 *  step (not in the Phase 2 PRD §9 list).
 *
 *  T5: when `template` is passed (from `/goals/new?template=<slug>`), the
 *  kind is fixed and step 0 is skipped, GoalForm is pre-filled from the
 *  template, and a starter checklist is seeded (best-effort) right after the
 *  goal is created. */
export function GoalWizard({
  defaultCurrency,
  template,
}: {
  defaultCurrency: Currency;
  template?: GoalTemplate;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<GoalKind | null>(template?.kind ?? null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [basics, setBasics] = useState<{
    values: ClientGoalInput;
    cover: CoverUploadResult | null;
  } | null>(null);
  const [concordance, setConcordance] = useState<SelfConcordanceAnswers | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Template prefill for GoalForm — deadline suggestion = today + the
  // template's offset (T5 decision), computed once per template on the
  // browser clock, not stored in the template itself.
  const templateInitialValues = useMemo(() => {
    if (!template) return undefined;
    return {
      title: template.titleSuggestion,
      description: template.description,
      deadline: format(addDays(new Date(), template.deadlineOffsetDays), "yyyy-MM-dd"),
    };
  }, [template]);

  function handleCollectBasics(values: ClientGoalInput, stagedCover: CoverUploadResult | null) {
    setBasics({ values, cover: stagedCover });
    setStep(2);
  }

  function handleConcordanceNext(answers: SelfConcordanceAnswers | null) {
    setConcordance(answers);
    setStep(3);
  }

  // Best-effort starter-checklist seeding: goal creation is the critical
  // path, so a failed POST is swallowed per-item and never blocks the
  // final navigation (T5 decision).
  async function seedStarterChecklist(goalId: string) {
    if (!template || template.starterChecklist.length === 0) return;

    for (const item of template.starterChecklist) {
      try {
        const res = await fetch(`/api/v1/goals/${goalId}/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            kind: item.kind,
            ifThen: item.ifThen,
          }),
        });
        if (!res.ok) {
          console.error("Не удалось создать пункт чек-листа из шаблона", item.title, res.status);
        }
      } catch (err) {
        console.error("Не удалось создать пункт чек-листа из шаблона", item.title, err);
      }
    }
  }

  function handleCreate(woop: WoopInput | null) {
    if (!basics) return;
    setCreateError(null);

    startTransition(async () => {
      const result = await createGoal({
        ...basics.values,
        selfConcordance: concordance ?? undefined,
        woop: woop ?? undefined,
      });

      if (!result.ok) {
        setCreateError(result.error);
        return;
      }

      if (basics.cover) {
        await registerMedia({
          goalId: result.goalId,
          path: basics.cover.path,
          setAsCover: true,
        });
      }

      await seedStarterChecklist(result.goalId);

      // Both create and edit land on the goal page (PRD §3.2) — the action
      // already called revalidatePath for it, so this navigation picks up
      // fresh data.
      router.push(`/goals/${result.goalId}`);
    });
  }

  if (!kind) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {KIND_CARDS.map(({ kind: k, title, description, Icon }) => (
          <Card
            key={k}
            role="button"
            tabIndex={0}
            onClick={() => setKind(k)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setKind(k);
            }}
            className="cursor-pointer transition hover:border-primary"
          >
            <CardHeader>
              <div
                aria-hidden
                className="mb-2 flex size-11 items-center justify-center rounded-2xl text-primary-foreground [background-image:var(--gradient-tile)]"
              >
                <Icon className="size-5" />
              </div>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step === 1 && !template ? (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => setKind(null)}
        >
          ← Назад
        </Button>
      ) : null}

      {step === 1 ? (
        <GoalForm
          mode="create"
          kind={kind}
          defaultCurrency={defaultCurrency}
          onCollect={handleCollectBasics}
          initialValues={templateInitialValues}
        />
      ) : step === 2 ? (
        <WizardConcordanceStep onNext={handleConcordanceNext} />
      ) : (
        <WizardWoopStep pending={isPending} error={createError} onCreate={handleCreate} />
      )}
    </div>
  );
}
