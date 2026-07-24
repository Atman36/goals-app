-- 0008 — отзыв прямого DML у ролей PostgREST (anon / authenticated)
--
-- СОСТОЯНИЕ ПРИМЕНЕНИЯ ЭТОГО ФАЙЛА ЗДЕСЬ НЕ ОПИСАНО И ОПИСАНО БЫТЬ НЕ МОЖЕТ.
-- Единственный источник истины — таблица public.manual_migration_ledger (миграция 0010):
--   node --env-file=.env scripts/migration-status.mjs
-- Применять только через: node --env-file=.env scripts/apply-migration.mjs <файл>
-- (drizzle-kit migrate / db:push в этом репозитории запрещены — см. 0010).
-- Перед применением — свежий бэкап: npm run db:backup
--
-- ЗАЧЕМ. Проверено на живом проекте 2026-07-20:
--   POST /rest/v1/goals как anon → 42501 "violates row-level security policy"
--     (а НЕ "permission denied for table") ⇒ грант INSERT существует;
--   DELETE /rest/v1/goals?id=eq.<uuid> → 204 ⇒ грант DELETE существует;
--   GET /auth/v1/settings → disable_signup:false ⇒ регистрация открыта.
-- Значит любой может завести аккаунт, получить токен authenticated и писать
-- строки в базу под своим uid. Чтение чужих данных сейчас закрыто только тем,
-- что владелец создан через crypto.randomUUID() и не совпадает с auth.uid().
--
-- ПОРЯДОК КРИТИЧЕН. Это несовпадение id — несущая защита: оно держит спящими
-- политики FOR ALL TO authenticated без фильтра по deleted_at (находки
-- CR-002/CR-004). Связывать public.users.id с auth.users.id можно ТОЛЬКО
-- после этой миграции и после разнесения FOR ALL по операциям.
--
-- БЕЗОПАСНО ДЛЯ ПРИЛОЖЕНИЯ. lib/db/index.ts подключается через postgres-js по
-- DATABASE_URL под владельцем БД — этот путь грантами ниже не затрагивается.
-- Клиентский Supabase (lib/supabase/client.ts) вызывает только
-- storage.uploadToSignedUrl(), т.е. Storage, а не таблицы.

BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.users,
  public.goals,
  public.contributions,
  public.checklist_items,
  public.comments,
  public.media_items,
  public.checkins,
  public.reflections,
  public.woop_entries,
  public.goal_revisions,
  public.fx_rates
FROM anon, authenticated;

-- SELECT тоже отзывается: прямых клиентских чтений в приложении нет,
-- все данные идут через сервер. Если позже понадобится прямое чтение —
-- выдавать его точечно и только вместе с раздельными SELECT-политиками
-- (spec 03), а не возвращать FOR ALL.
REVOKE SELECT ON TABLE
  public.users,
  public.goals,
  public.contributions,
  public.checklist_items,
  public.comments,
  public.media_items,
  public.checkins,
  public.reflections,
  public.woop_entries,
  public.goal_revisions
FROM anon, authenticated;

-- Чтобы будущие таблицы не унаследовали широкие права по умолчанию.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

COMMIT;

-- ПРОВЕРКА ПОСЛЕ ПРИМЕНЕНИЯ (ожидается 0 строк):
--   SELECT table_name, privilege_type, grantee
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public'
--      AND grantee IN ('anon','authenticated')
--      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
--
-- ОСТАЁТСЯ СДЕЛАТЬ ВРУЧНУЮ В ПАНЕЛИ SUPABASE (SQL этого не покрывает):
--   Authentication → Providers/Settings → отключить регистрацию (signup)
--   до Этапа 1. Иначе поверхность /auth/v1 остаётся открытой, даже когда
--   таблицы закрыты.
