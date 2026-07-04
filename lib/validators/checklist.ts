import { z } from "zod";

export const checklistItemKindSchema = z.enum([
  "action",
  "document",
  "purchase",
  "agreement",
  "if_then",
]);

export const ifThenPlanSchema = z.object({
  trigger: z.string().trim().min(1).max(280),
  action: z.string().trim().min(1).max(280),
  planType: z.enum(["initiation", "maintenance", "relapse_prevention"]),
});

export const checklistItemSchema = z.object({
  goalId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  note: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
  kind: checklistItemKindSchema.default("action"),
  ifThen: ifThenPlanSchema.optional(),
}).refine((data) => data.kind !== "if_then" || !!data.ifThen, {
  message: "if_then items require an if-then plan",
  path: ["ifThen"],
});

export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;

// Route param schema for app/api/v1/checklist/[itemId] — imported rather
// than written as a bare z.uuid() call in the route file itself, so every
// schema definition stays under lib/validators.
export const checklistItemIdSchema = z.uuid();

// Wire (request-body) schemas for app/api/v1/**/checklist routes — distinct
// from checklistItemSchema (the domain schema), which needs goalId injected
// from the route param before it can validate.
export const checklistPatchBodySchema = z.object({ isDone: z.boolean() });

// Structured if-then form is Phase 2 (PRD facts, T8 spec) — MVP only accepts
// these 4 plain kinds from the client.
const MVP_KINDS = ["action", "document", "purchase", "agreement"] as const;

export const checklistPostBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(MVP_KINDS).optional(),
  note: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
});
