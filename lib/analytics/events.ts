import type { z } from "zod";
import type { checklistItemKindSchema } from "@/lib/validators/checklist";
import type { currencySchema, goalKindSchema } from "@/lib/validators/goal";
import { logger } from "@/lib/log";

type Currency = z.infer<typeof currencySchema>;
type GoalKind = z.infer<typeof goalKindSchema>;
type ChecklistItemKind = z.infer<typeof checklistItemKindSchema>;

// Common optional props any event may carry — PRD §8.4.
type CommonProps = {
  goal_id?: string;
  goal_kind?: GoalKind;
  currency?: Currency;
};

// Exactly the event catalogue in PRD §8.4 — do not add events here without a PRD update.
export type AnalyticsEvent = CommonProps &
  (
    | {
        name: "goal_created";
        kind: GoalKind;
        currency?: Currency;
        has_woop: boolean;
        has_concordance: boolean;
        checklist_size: number;
      }
    | {
        name: "goal_achieved";
        kind: GoalKind;
        days_to_achieve: number;
        progress_events_count: number;
      }
    | {
        name: "goal_archived";
        kind: GoalKind;
        progress_pct: number;
      }
    | {
        name: "contribution_added";
        currency: Currency;
        amount_bucket: string;
        is_preset: boolean;
        is_negative: boolean;
      }
    | {
        name: "checklist_item_added";
        kind: ChecklistItemKind;
      }
    | {
        name: "checklist_item_done";
        goal_kind: GoalKind;
      }
    | {
        name: "comment_added";
        has_media: boolean;
      }
    | {
        name: "media_uploaded";
        context: "cover" | "gallery" | "comment";
      }
    | {
        name: "gallery_opened";
        scope: "goal" | "global";
      }
    | {
        name: "error_shown";
        code: string;
        surface: string;
      }
  );

/**
 * Structured analytics sink. Writes a pino log line today; PostHog wiring is
 * Phase 2 (PRD §9) and slots in here without call-site changes.
 */
export function track(event: AnalyticsEvent): void {
  logger.info({ analytics: event }, event.name);
}
