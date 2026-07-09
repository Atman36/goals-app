import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GOAL_TEMPLATES } from "@/lib/goal-templates";

const KIND_LABEL = { financial: "Финансовая", non_financial: "Нефинансовая" } as const;

/** Default landing of /goals/new (T5): a picker of 4 ready-made templates
 *  (each links to `?template=<slug>`, opening the wizard pre-filled) plus a
 *  "Своя цель с нуля" escape hatch to today's blank flow (`?custom=1`).
 *  Server Component — pure links, no client state needed. */
export function TemplatePicker() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {GOAL_TEMPLATES.map((tpl) => (
        <Link key={tpl.slug} href={`/goals/new?template=${tpl.slug}`} className="block">
          <Card className="h-full cursor-pointer transition hover:border-primary">
            <CardHeader>
              <div
                aria-hidden
                className="mb-2 flex size-11 items-center justify-center rounded-2xl text-2xl [background-image:var(--gradient-tile)]"
              >
                {tpl.emoji}
              </div>
              <CardTitle>{tpl.label}</CardTitle>
              <Badge variant="secondary" className="w-fit">
                {KIND_LABEL[tpl.kind]}
              </Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{tpl.description}</CardContent>
          </Card>
        </Link>
      ))}

      <Link href="/goals/new?custom=1" className="block">
        <Card className="h-full cursor-pointer transition hover:border-primary">
          <CardHeader>
            <div
              aria-hidden
              className="mb-2 flex size-11 items-center justify-center rounded-2xl text-primary-foreground [background-image:var(--gradient-tile)]"
            >
              <Sparkles className="size-5" />
            </div>
            <CardTitle>Своя цель с нуля</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Пустая форма — заполните всё сами.
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
