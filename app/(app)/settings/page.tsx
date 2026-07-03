import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// TODO(build): profile form (имя, валюта по умолчанию, тема, день рефлексии) — PRD §3.8.
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <div>
            <Label>Валюта по умолчанию</Label>
            <p>₽ / $ — форма ещё не подключена.</p>
          </div>
          <div>
            <Label>Тема</Label>
            <p>Светлая / тёмная — форма ещё не подключена.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
