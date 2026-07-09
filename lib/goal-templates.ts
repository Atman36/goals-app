import { goalKindEnum } from "@/lib/db/schema";

// No `GoalKind` type is exported from lib/db/schema.ts (only the Drizzle
// pgEnum const) — derive it the same way lib/db/queries/goals.ts does rather
// than duplicating the "financial" | "non_financial" literal union.
export type GoalKind = (typeof goalKindEnum.enumValues)[number];

export type TemplateChecklistItem = {
  title: string;
  kind: "action" | "document" | "purchase" | "agreement" | "if_then";
  ifThen?: {
    trigger: string;
    action: string;
    planType: "initiation" | "maintenance" | "relapse_prevention";
  };
};

export interface GoalTemplate {
  slug: "vacation" | "safety-cushion" | "purchase" | "health";
  label: string;
  emoji: string;
  kind: GoalKind;
  /** Prefills GoalForm's `title`. */
  titleSuggestion: string;
  /** Prefills GoalForm's `description`. */
  description: string;
  /** Suggested deadline = today + this many days (computed client-side). */
  deadlineOffsetDays: number;
  /** Seeded via POST /api/v1/goals/:goalId/checklist after goal creation. */
  starterChecklist: TemplateChecklistItem[];
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    slug: "vacation",
    label: "Отпуск",
    emoji: "🏖️",
    kind: "financial",
    titleSuggestion: "Отпуск",
    description: "Накопить на поездку и всё спланировать",
    deadlineOffsetDays: 180,
    starterChecklist: [
      { title: "Выбрать направление и даты", kind: "action" },
      { title: "Забронировать жильё", kind: "action" },
      { title: "Купить билеты", kind: "purchase" },
      { title: "Оформить документы и страховку", kind: "document" },
    ],
  },
  {
    slug: "safety-cushion",
    label: "Подушка безопасности",
    emoji: "🛟",
    kind: "financial",
    titleSuggestion: "Подушка безопасности",
    description: "Резерв на 3–6 месяцев расходов",
    deadlineOffsetDays: 365,
    starterChecklist: [
      { title: "Посчитать месячные расходы", kind: "action" },
      { title: "Определить цель: 3–6 месяцев расходов", kind: "action" },
      { title: "Открыть отдельный накопительный счёт", kind: "action" },
      { title: "Настроить автопополнение", kind: "agreement" },
    ],
  },
  {
    slug: "purchase",
    label: "Крупная покупка",
    emoji: "🛍️",
    kind: "financial",
    titleSuggestion: "Крупная покупка",
    description: "Накопить на нужную вещь",
    deadlineOffsetDays: 180,
    starterChecklist: [
      { title: "Определить, что покупаем, и цену", kind: "action" },
      { title: "Сравнить варианты и продавцов", kind: "action" },
      { title: "Накопить нужную сумму", kind: "action" },
    ],
  },
  {
    slug: "health",
    label: "Здоровье",
    emoji: "🌿",
    kind: "non_financial",
    titleSuggestion: "Здоровье",
    description: "Регулярные шаги к лучшему самочувствию",
    deadlineOffsetDays: 90,
    starterChecklist: [
      { title: "Пройти чек-ап у врача", kind: "document" },
      {
        title: "Зарядка по будням",
        kind: "if_then",
        ifThen: {
          trigger: "Каждый будний день в 8:00",
          action: "15 минут зарядки",
          planType: "initiation",
        },
      },
      {
        title: "Прогулка после обеда",
        kind: "if_then",
        ifThen: {
          trigger: "После обеда",
          action: "10-минутная прогулка",
          planType: "maintenance",
        },
      },
      { title: "Наладить режим сна", kind: "action" },
    ],
  },
];

export function getTemplate(slug: string): GoalTemplate | undefined {
  return GOAL_TEMPLATES.find((t) => t.slug === slug);
}
