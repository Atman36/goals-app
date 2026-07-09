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
} from "drizzle-orm/pg-core";

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

// P2
export const reflections = pgTable("reflections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  promised: text("promised"),
  done: text("done"),
  blocked: text("blocked"),
  newIfThen: text("new_if_then"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
export type Reflection = typeof reflections.$inferSelect;
export type FxRate = typeof fxRates.$inferSelect;
