"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isExternallyDriven, type SelfConcordanceAnswers } from "@/lib/utils/concordance";

type QuestionKey = keyof SelfConcordanceAnswers;

// Label order fixed — PRD §3.2 self-concordance check (T11 spec).
const QUESTIONS: { key: QuestionKey; label: string }[] = [
  { key: "interest", label: "Эта цель мне по-настоящему интересна" },
  { key: "values", label: "Она отражает мои ценности и то, каким я хочу быть" },
  { key: "guilt", label: "Я буду винить себя или мне будет стыдно, если брошу её" },
  { key: "externalPressure", label: "Я делаю это, потому что этого ждут другие" },
];

const SCALE = [1, 2, 3, 4, 5] as const;

type PartialAnswers = Partial<Record<QuestionKey, number>>;

/** Step 2 of the goal wizard (PRD §3.2 Phase 2) — optional, skippable, no
 *  back navigation. Zero answers ⇒ "Далее" behaves like skip; 1–3 answers ⇒
 *  blocked with an inline hint until all four are answered or the user picks
 *  "Пропустить". */
export function WizardConcordanceStep({
  onNext,
}: {
  onNext: (answers: SelfConcordanceAnswers | null) => void;
}) {
  const [answers, setAnswers] = useState<PartialAnswers>({});
  const [showHint, setShowHint] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const complete = answeredCount === QUESTIONS.length ? (answers as SelfConcordanceAnswers) : null;
  const showWarning = complete !== null && isExternallyDriven(complete);

  function handleNext() {
    if (answeredCount === 0) {
      onNext(null);
      return;
    }
    if (!complete) {
      setShowHint(true);
      return;
    }
    onNext(complete);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-bold">Своя ли это цель?</h2>
        <p className="text-sm text-muted-foreground">
          Ответьте честно — цели, которые держатся на чувстве долга, бросают чаще.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {QUESTIONS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{label}</p>
            <div className="flex gap-2">
              {SCALE.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={answers[key] === value ? "default" : "outline"}
                  aria-pressed={answers[key] === value}
                  aria-label={`Оценка ${value} из 5`}
                  className="flex-1"
                  onClick={() => {
                    setShowHint(false);
                    setAnswers((prev) => ({ ...prev, [key]: value }));
                  }}
                >
                  {value}
                </Button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 — совсем нет</span>
              <span>5 — полностью да</span>
            </div>
          </div>
        ))}
      </div>

      {showWarning ? (
        <div className="rounded-2xl bg-warn/12 px-4 py-3 text-sm text-warn">
          Похоже, цель больше опирается на чувство вины или ожидания других, чем на ваш собственный
          интерес. Такие цели чаще бросают. Попробуйте переформулировать её через то, что важно лично
          вам.
        </div>
      ) : null}

      {showHint ? (
        <p className="text-sm text-destructive">Ответьте на все четыре вопроса или пропустите шаг</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" className="w-full" onClick={handleNext}>
          Далее
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => onNext(null)}>
          Пропустить
        </Button>
      </div>
    </div>
  );
}
