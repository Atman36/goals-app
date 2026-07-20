import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

// PRD §3.8 profile: name, default currency, theme. The weekly-reflection-day
// control was removed as a false promise — see settings-form.tsx (CR-024).
// Server component; the mutable fields live in the client-side
// settings-form.tsx (needs interactivity for the instant theme toggle).
export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">Настройки</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Почта</span>
            <span>{user.email}</span>
          </div>
          {/* Keyed by the fields the form pre-fills via defaultValue (uncontrolled
              inputs) — without a key, a post-save revalidation re-renders this
              component in place and React leaves the already-mounted <select>s
              showing their pre-save values instead of the just-saved ones. */}
          <SettingsForm key={`${user.name}-${user.defaultCurrency}-${user.theme}`} user={user} />
        </CardContent>
      </Card>
    </div>
  );
}
