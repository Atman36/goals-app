import { z } from "zod";

export const addCommentSchema = z.object({
  goalId: z.uuid(),
  body: z.string().trim().min(1).max(2000),
  media: z
    .object({
      path: z.string().min(1),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    })
    .optional(),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const deleteCommentSchema = z.object({
  goalId: z.uuid(),
  commentId: z.uuid(),
});

export type DeleteCommentInput = z.infer<typeof deleteCommentSchema>;
