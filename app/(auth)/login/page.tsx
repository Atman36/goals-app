import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// TODO(build): magic-link Server Action + Google OAuth via Supabase, allowlist
// enforcement lives in lib/supabase/middleware.ts — PRD §3.8.
export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вход в «Цели»</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" disabled />
          </div>
          <Button disabled>Отправить magic link</Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            или
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" disabled>
            Войти через Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
