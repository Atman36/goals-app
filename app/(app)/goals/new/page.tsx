import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// TODO(build): full multi-step wizard (тип → основа → self-concordance →
// WOOP → чек-лист) per PRD §3.2. This is a placeholder for step 0.
export default function NewGoalPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Новая цель</h1>
      <div className="grid grid-cols-2 gap-4">
        <Card className="cursor-pointer transition hover:border-primary">
          <CardHeader>
            <CardTitle>Финансовая</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Сумма, валюта и срок — прогресс по накоплениям.
          </CardContent>
        </Card>
        <Card className="cursor-pointer transition hover:border-primary">
          <CardHeader>
            <CardTitle>Нефинансовая</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Срок и чек-лист шагов — прогресс по выполненным пунктам.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
