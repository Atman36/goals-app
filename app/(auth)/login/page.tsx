import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Войти в Цели</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm redirectError={error} />
        </CardContent>
      </Card>
    </div>
  );
}
