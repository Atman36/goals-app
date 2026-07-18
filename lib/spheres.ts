// Life spheres (сферы жизни) a goal can optionally belong to. Keys are
// permanent (stored in the DB enum), labels may later be renamed to match
// the КПД методичка — that is why keys and labels are separated. This is the
// ONE source of sphere truth: schema.ts, validators and UI all import from
// here (Stage0-4).
export const GOAL_SPHERES = [
  "health",
  "career",
  "finance",
  "growth",
  "relationships",
  "environment",
  "leisure",
  "meaning",
] as const;

export type GoalSphere = (typeof GOAL_SPHERES)[number];

export const SPHERE_LABELS: Record<GoalSphere, string> = {
  health: "Здоровье",
  career: "Работа и карьера",
  finance: "Финансы",
  growth: "Развитие и обучение",
  relationships: "Отношения и семья",
  environment: "Окружение и друзья",
  leisure: "Отдых и удовольствия",
  meaning: "Смысл и духовность",
};
