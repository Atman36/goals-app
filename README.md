# Цели

Персональное веб-приложение для постановки, финансирования и достижения целей — построено на доказательной методологии достижения целей (теория функциональных систем Анохина, WOOP, Implementation Intentions, Self-Monitoring).

## Стек

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 + shadcn/ui · Drizzle ORM · Supabase (Postgres + Storage) · TanStack Query · Zod · react-hook-form.

## Статус

Реализован MVP (Phase 1 по PRD): single-owner режим без логина (T9), CRUD целей, финансовый quick-add со взносами, чек-листы, комментарии, галерея, настройки. Функции Phase 2 (индикатор темпа, WOOP, рефлексии, FX) присутствуют только как заглушки — см. «Известные ограничения».

> **Важно: в приложении нет аутентификации.** Раньше был вход по allowlist владельца
> (magic link/Google) — T9 убрал его полностью: свободный тариф Supabase не позволяет
> кастомизировать письма. `getCurrentUser()` всегда возвращает одну и ту же (единственную)
> строку пользователя. Это значит: **любой, кто откроет публичный URL деплоя, получает
> полный доступ на чтение/запись** ко всем целям, взносам и фото владельца. Если
> приложение задеплоено (например, на Vercel) — закройте доступ на уровне платформы
> (Vercel Deployment Protection / Password Protection) или держите деплой приватным;
> сам код это больше не ограничивает.

## Начало работы

Что нужно свежей машине, чтобы поднять приложение:

### 1. Проект Supabase и переменные окружения

Создайте проект в [Supabase](https://supabase.com/dashboard), затем скопируйте `.env.example` → `.env.local` и заполните:

| Переменная | Где взять |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → Project API keys → `service_role` (секрет) — нужен для подписи storage-операций (T10): без пользовательской сессии (T9) анонимный клиент не проходит RLS приватного бакета `media` |
| `DATABASE_URL` | Settings → Database → Connection string (пул «Transaction») |
| `OWNER_EMAIL` | Email единственного пользователя — используется только как значение `users.email` при первом создании его строки (см. `getOrCreateOwner`); опционален, без него подставится `owner@goals.local` |

> `NEXT_PUBLIC_SITE_URL` из старой auth-схемы (redirect-URL для входа) больше не используется — T9 убрал вход целиком.

### 2. Миграции БД

`npm run db:generate` уже выполнен — SQL лежит в `drizzle/`. Примените обе миграции (`npx drizzle-kit migrate` или вручную через SQL Editor в Supabase), **включая `0001`** — в ней RLS-политики, CHECK-ограничения и триггер валютной блокировки:

```bash
npx drizzle-kit migrate
```

> Не используйте `db:push` для настоящей БД: он синхронизирует только `schema.ts` и пропустит `0001` (RLS/constraints/trigger написаны вручную).

### 3. Storage-бакет

В проекте Supabase создайте **приватный** бакет Storage с именем `media` (Storage → New bucket → снять галочку «Public»). Все обложки и фото галереи читаются через короткоживущие signed URL. В настройках бакета задайте лимит размера файла 10 МБ и разрешённые MIME-типы `image/jpeg, image/png, image/webp` — так хранилище само обеспечивает то, что сейчас предполагает только код приложения.

### 4. Ежедневные бэкапы

Включите daily backups в настройках проекта Supabase (Database → Backups) — требование PRD §8.1 (P0). Это настройка дашборда, не код.

Дополнительно — логический бэкап командой `npm run db:backup` (pg_dump/psql/supabase CLI на этой машине нет, поэтому скрипт использует штатный `postgres`-драйвер приложения). Пишет в `~/Backups/goals-app/backup-<timestamp>/` — вне репозитория, в git не попадает: по одному JSON-файлу на таблицу схемы `public` (все строки) плюс `manifest.json` со сводкой (таблицы со счётчиками строк, коммит, статус журнала `drizzle.__drizzle_migrations`).

Восстановление:
- при аварии — первично: Supabase dashboard → Backups/PITR (точка восстановления для всего проекта);
- точечно — вставить нужные строки из JSON-файла вручную через SQL Editor (`INSERT INTO ...` по данным дампа), когда достаточно восстановить один объект, а не всю БД;
- бэкап `npm run db:backup` обязателен перед каждой миграцией схемы (growth-reactor v5 §10.1).

### 5. Sentry (опционально)

Для сбора ошибок задайте `SENTRY_DSN` и `NEXT_PUBLIC_SENTRY_DSN`.

### 6. Запуск и проверка

```bash
npm install
npm run dev          # http://localhost:3000
```

Полная батарея проверок:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## Известные ограничения

- **E2e прогнан вручную (2026-07-05)** против реального Supabase-проекта: обе цели (финансовая/чек-лист), quick-add, чек-лист, комментарии, настройки, галерея, 404, редактирование, валютная блокировка — все работают. Не проверялась вручную загрузка фото (нужен реальный файл) и архивирование цели.
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
  (auth)/login/            стаб-редирект на "/" (старая ссылка на вход, T9)
  (app)/                   без auth-гейта — single-owner режим (T9)
    page.tsx               дашборд
    goals/new/              визард создания цели
    goals/[goalId]/         страница цели
    gallery/                общая галерея
    reflections/            еженедельная рефлексия (P2)
    settings/                профиль
  api/v1/                   тонкий REST-слой (задел под Telegram Mini App, PRD §5.3)
lib/
  db/                       Drizzle-схема и клиент
  supabase/                 клиенты для браузера/сервера (admin.ts — service-role, storage only)
  validators/               Zod-схемы (единый источник правды форм и Server Actions)
  utils/                    money.ts (bigint в минорных единицах), pace.ts (темп по PRD §3.3.4)
components/
  goals/, gallery/, ui/     (shadcn/ui)
```
