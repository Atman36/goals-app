"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/lib/actions/profile";
import type { User } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Пн–Вс order for display; values match users.reflection_day's own contract
// (0=Sunday..6=Saturday), so Monday is 1 and Sunday is 0.
const REFLECTION_DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Понедельник" },
  { value: 2, label: "Вторник" },
  { value: 3, label: "Среда" },
  { value: 4, label: "Четверг" },
  { value: 5, label: "Пятница" },
  { value: 6, label: "Суббота" },
  { value: 0, label: "Воскресенье" },
];

const SELECT_CLASSNAME =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const initialState: ProfileState = { status: "idle" };

export function SettingsForm({ user }: { user: User }) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Имя</Label>
          <Input id="name" name="name" defaultValue={user.name ?? ""} maxLength={60} required />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="defaultCurrency">Валюта по умолчанию</Label>
          <select
            id="defaultCurrency"
            name="defaultCurrency"
            defaultValue={user.defaultCurrency}
            className={SELECT_CLASSNAME}
          >
            <option value="RUB">₽ Рубли</option>
            <option value="USD">$ Доллары</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="theme">Тема</Label>
          <select
            id="theme"
            name="theme"
            defaultValue={user.theme}
            onChange={(e) => {
              // Instant client feedback (T10 decision) — flips the palette
              // right away; the actual submit persists it as the new default.
              document.documentElement.classList.toggle("dark", e.target.value === "dark");
            }}
            className={SELECT_CLASSNAME}
          >
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="reflectionDay">День еженедельной рефлексии</Label>
          <select
            id="reflectionDay"
            name="reflectionDay"
            defaultValue={user.reflectionDay ?? 1}
            className={SELECT_CLASSNAME}
          >
            {REFLECTION_DAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>

        {state.status === "error" ? <p className="text-sm text-destructive">{state.message}</p> : null}
        {state.status === "success" ? (
          <p className="text-sm" style={{ color: "var(--positive)" }}>
            {state.message}
          </p>
        ) : null}

        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </form>
    </div>
  );
}
