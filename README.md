# Цели

Персональное веб-приложение для постановки, финансирования и достижения целей — построено на доказательной методологии достижения целей (теория функциональных систем Анохина, WOOP, Implementation Intentions, Self-Monitoring).

## Стек

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 + shadcn/ui · Drizzle ORM · Supabase (Postgres + Auth + Storage) · TanStack Query · Zod · react-hook-form.

## Статус

Реализован MVP (Phase 1 по PRD): аутентификация по allowlist владельца, CRUD целей, финансовый quick-add со взносами, чек-листы, комментарии, галерея, настройки. Функции Phase 2 (индикатор темпа, WOOP, рефлексии, FX) присутствуют только как заглушки — см. «Известные ограничения».

## Начало работы

Что нужно свежей машине, чтобы поднять приложение:

### 1. Проект Supabase и переменные окружения

Создайте проект в [Supabase](https://supabase.com/dashboard), затем скопируйте `.env.example` → `.env.local` и заполните:

| Переменная | Где взять |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → Project API keys → `service_role` (секрет) |
| `DATABASE_URL` | Settings → Database → Connection string (пул «Transaction») |
| `OWNER_EMAIL` | Ваш email — **единственный**, кому разрешён вход (PRD §3.8) |
| `NEXT_PUBLIC_SITE_URL` | Публичный origin (dev: `http://localhost:3000`) — из него строятся redirect-URL для входа |

> Если `OWNER_EMAIL` не задан — вход закрыт для всех (fail-closed): и форма входа, и proxy отклоняют любую сессию.

### 2. Миграции БД

`npm run db:generate` уже выполнен — SQL лежит в `drizzle/`. Примените обе миграции (`npx drizzle-kit migrate` или вручную через SQL Editor в Supabase), **включая `0001`** — в ней RLS-политики, CHECK-ограничения и триггер валютной блокировки:

```bash
npx drizzle-kit migrate
```

> Не используйте `db:push` для настоящей БД: он синхронизирует только `schema.ts` и пропустит `0001` (RLS/constraints/trigger написаны вручную).

### 3. Storage-бакет

В проекте Supabase создайте **приватный** бакет Storage с именем `media` (Storage → New bucket → снять галочку «Public»). Все обложки и фото галереи читаются через короткоживущие signed URL. В настройках бакета задайте лимит размера файла 10 МБ и разрешённые MIME-типы `image/jpeg, image/png, image/webp` — так хранилище само обеспечивает то, что сейчас предполагает только код приложения.

### 4. Auth: Google OAuth + magic link

В Supabase → Authentication:

- включите провайдер **Google** (Providers → Google) и **Email** с magic link;
- в **Redirect URLs** (URL Configuration) добавьте `<NEXT_PUBLIC_SITE_URL>/auth/callback` (OAuth) и `<NEXT_PUBLIC_SITE_URL>/auth/confirm` (magic link).

### 5. Ежедневные бэкапы

Включите daily backups в настройках проекта Supabase (Database → Backups) — требование PRD §8.1 (P0). Это настройка дашборда, не код.

### 6. Sentry (опционально)

Для сбора ошибок задайте `SENTRY_DSN` и `NEXT_PUBLIC_SENTRY_DSN`.

### 7. Запуск и проверка

```bash
npm install
npm run dev          # http://localhost:3000
```

Полная батарея проверок:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## Известные ограничения

- **Нет живого e2e-прогона.** Кодовая база проверена статически + `typecheck/lint/test/build`; сквозной прогон с реальным Supabase-проектом ещё не выполнялся.
- **Phase 2 — заглушки.** Индикатор темпа (pace), WOOP, еженедельные рефлексии и мультивалютный пересчёт (FX) пока не реализованы как функции.
- **Аналитика без PostHog.** События (`lib/analytics/events.ts`) пишутся через pino-логгер; отправка в PostHog отложена до Phase 2.

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
  (app)/                   защищённая зона (гейт — proxy.ts + lib/supabase/middleware.ts)
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
