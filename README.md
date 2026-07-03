# Цели

Персональное веб-приложение для постановки, финансирования и достижения целей — построено на доказательной методологии достижения целей (теория функциональных систем Анохина, WOOP, Implementation Intentions, Self-Monitoring).

Полное описание продукта, пользовательские сценарии, модель данных и фазы разработки — в [`docs/prd-goals-app.md`](docs/prd-goals-app.md).

Промпт для дальнейшей сборки полного MVP силами AI-агента — в [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md).

## Стек

Next.js 15+ (App Router) · TypeScript · Tailwind CSS 4 + shadcn/ui · Drizzle ORM · Supabase (Postgres + Auth + Storage) · Zod · react-hook-form.

## Статус

Базовый каркас: структура проекта, схема БД, Supabase-клиенты, Zod-валидаторы, заглушки страниц. Бизнес-логика (Server Actions, реальные запросы, визард создания цели, quick-add) ещё не реализована — см. `docs/BUILD_PROMPT.md`.

## Начало работы

1. Создайте проект в [Supabase](https://supabase.com/dashboard) и скопируйте `.env.example` в `.env.local`, заполнив переменные (URL, anon key, connection string).
2. Установите зависимости и примените схему БД:

   ```bash
   npm install
   npm run db:push
   ```

3. Запустите dev-сервер:

   ```bash
   npm run dev
   ```

   Откройте [http://localhost:3000](http://localhost:3000).

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run dev` | dev-сервер (Turbopack) |
| `npm run build` | production-сборка |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | сгенерировать SQL-миграцию из `lib/db/schema.ts` |
| `npm run db:push` | применить схему к БД напрямую (для разработки) |
| `npm run db:studio` | Drizzle Studio — просмотр/редактирование данных |

## Структура проекта

```
app/
  (auth)/login/            вход (magic link + Google)
  (app)/                   защищённая зона (см. middleware.ts)
    page.tsx               дашборд
    goals/new/              визард создания цели
    goals/[goalId]/         страница цели
    gallery/                общая галерея
    reflections/            еженедельная рефлексия (P2)
    settings/                профиль
  api/v1/                   тонкий REST-слой (задел под Telegram Mini App, PRD §5.3)
lib/
  db/                       Drizzle-схема и клиент
  supabase/                 клиенты для браузера/сервера/middleware
  validators/               Zod-схемы (единый источник правды форм и Server Actions)
  utils/                    money.ts (bigint в минорных единицах), pace.ts (темп по PRD §3.3.4)
components/
  goals/, gallery/, ui/     (shadcn/ui)
```
