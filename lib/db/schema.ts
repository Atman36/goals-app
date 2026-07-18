import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  bigint,
  smallint,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { GOAL_SPHERES } from "@/lib/spheres";

// --- Enums ---------------------------------------------------------------

export const currencyEnum = pgEnum("currency", ["RUB", "USD"]);
export const themeEnum = pgEnum("theme", ["light", "dark"]);
export const goalKindEnum = pgEnum("goal_kind", ["financial", "non_financial"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "achieved", "archived"]);
export const checklistItemKindEnum = pgEnum("checklist_item_kind", [
  "action",
  "document",
  "purchase",
  "agreement",
  "if_then",
]);
export const fxSourceEnum = pgEnum("fx_source", ["cbr", "manual"]);
export const checkinOutcomeEnum = pgEnum("checkin_outcome", ["done", "partial", "skipped"]);
export const goalSphereEnum = pgEnum("goal_sphere", [...GOAL_SPHERES]);

// --- Tables ----------------------------------------------------------------
// Money is always bigint in minor units (kopecks/cents) — see PRD §4/§7.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  defaultCurrency: currencyEnum("default_currency").notNull().default("RUB"),
  theme: themeEnum("theme").notNull().default("light"),
  reflectionDay: smallint("reflection_day"), // 0=Sunday..6=Saturday
  focusGoalId: uuid("focus_goal_id"), // FK to goals.id, enforced at query layer (soft-delete only, circular)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: goalKindEnum("kind").notNull(),
  sphere: goalSphereEnum("sphere"), // nullable — existing goals stay "Без сферы"
  title: varchar("title", { length: 60 }).notNull(),
  description: text("description"),
  coverImageId: uuid("cover_image_id"), // FK to mediaItems, added via ALTER (circular)
  currency: currencyEnum("currency"), // required for financial, null for non_financial
  targetAmount: bigint("target_amount", { mode: "bigint" }), // minor units; required for financial
  initialAmount: bigint("initial_amount", { mode: "bigint" }).default(0n), // financial only
  manualProgress: smallint("manual_progress"), // 0-100, non_financial only, P1
  deadline: date("deadline").notNull(),
  status: goalStatusEnum("status").notNull().default("active"),
  achievedAt: timestamp("achieved_at", { withTimezone: true }),
  selfConcordance: jsonb("self_concordance").$type<{
    interest: number;
    values: number;
    guilt: number;
    externalPressure: number;
  } | null>(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const contributions = pgTable("contributions", {
  // client-generated UUID for idempotency (PRD §3.3.1/§7)
  id: uuid("id").primaryKey(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "bigint" }).notNull(), // minor units, may be negative
  note: text("note"),
  occurredAt: date("occurred_at").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  note: text("note"),
  dueDate: date("due_date"),
  kind: checklistItemKindEnum("kind").notNull().default("action"),
  ifThen: jsonb("if_then").$type<{
    trigger: string;
    action: string;
    planType: "initiation" | "maintenance" | "relapse_prevention";
  } | null>(),
  isDone: boolean("is_done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const mediaItems = pgTable("media_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  width: integer("width"),
  height: integer("height"),
  blurhash: text("blurhash"),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const woopEntries = pgTable("woop_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  wish: text("wish").notNull(),
  outcome: text("outcome").notNull(),
  obstacle: text("obstacle").notNull(),
  plan: text("plan").notNull(),
  lastLivedAt: timestamp("last_lived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Daily emotion check-in for a goal — growth-reactor v5 §5/§6/§12. Goal-child
// table (no user_id; ownership via goals.user_id, same as contributions/
// checklistItems/comments/mediaItems). One row per (goal_id, date) — see the
// unique index below and the upsert in lib/db/queries/checkins.ts.
export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    outcome: checkinOutcomeEnum("outcome").notNull(),
    feeling: smallint("feeling").notNull(), // 1-5; range enforced by a DB CHECK (see drizzle/0003_checkins.sql)
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("checkins_goal_date_unique").on(table.goalId, table.date)],
);

// Weekly reflection: 5 questions + the previous week's promise outcome
// (growth-reactor v5 §6/§11/§12). One row per (user_id, week_start) — see the
// unique index below and the upsert in lib/db/queries/reflections.ts. A row
// reviews the PREVIOUS week and records the promise FOR the current week;
// prevOutcome marks that promise's fate and is filled in on the NEXT week's
// row (a completed cycle = a row with prevOutcome set).
export const reflections = pgTable(
  "reflections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    promised: text("promised"),
    done: text("done"),
    blocked: text("blocked"),
    newIfThen: text("new_if_then"),
    learned: text("learned"),
    promise: text("promise"),
    prevOutcome: checkinOutcomeEnum("prev_outcome"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("reflections_user_week_unique").on(table.userId, table.weekStart)],
);

// P2 — reference FX rate for portfolio equivalent
export const fxRates = pgTable("fx_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  base: currencyEnum("base").notNull(),
  quote: currencyEnum("quote").notNull(),
  rate: text("rate").notNull(), // numeric stored as text to avoid float; parse with a decimal lib
  source: fxSourceEnum("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type MediaItem = typeof mediaItems.$inferSelect;
export type WoopEntry = typeof woopEntries.$inferSelect;
export type NewWoopEntry = typeof woopEntries.$inferInsert;
export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;
export type Reflection = typeof reflections.$inferSelect;
export type NewReflection = typeof reflections.$inferInsert;
export type FxRate = typeof fxRates.$inferSelect;
