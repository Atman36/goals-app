"use client";

import { useState } from "react";
import { ListChecks, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GoalForm } from "@/components/goals/goal-form";
import type { Currency } from "@/lib/validators/goal";

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

/** Step 0 (kind) → step 1 (lib/actions/goals.ts's createGoal, via GoalForm) —
 *  PRD §3.2. Steps 2–4 (self-concordance/WOOP/checklist) are Phase 2. */
export function GoalWizard({ defaultCurrency }: { defaultCurrency: Currency }) {
  const [kind, setKind] = useState<GoalKind | null>(null);

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
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => setKind(null)}
      >
        ← Назад
      </Button>
      <GoalForm mode="create" kind={kind} defaultCurrency={defaultCurrency} />
    </div>
  );
}
