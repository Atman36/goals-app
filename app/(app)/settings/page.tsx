import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

// PRD §3.8 profile: name, default currency, theme, weekly reflection day.
// Server component; the mutable fields live in the client-side
// settings-form.tsx (needs interactivity for the instant theme toggle).
export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Почта</span>
            <span>{user.email}</span>
          </div>
          <SettingsForm user={user} />
        </CardContent>
      </Card>
    </div>
  );
}
