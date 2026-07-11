-- Preserve the previous Supabase application tables before installing the
-- PostgreSQL schema used by uAI News v1.2.0. Moving them to a separate schema
-- keeps their data, constraints, indexes, and foreign-key relationships intact.

CREATE SCHEMA IF NOT EXISTS legacy_20260712;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'user_bookmarks',
    'user_source_subscriptions',
    'news_items',
    'raw_posts',
    'sources'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
       AND to_regclass(format('legacy_20260712.%I', table_name)) IS NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy_20260712', table_name);
    END IF;
  END LOOP;
END;
$$;
