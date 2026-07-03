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
