CREATE TABLE IF NOT EXISTS site_ai_settings (
  id text PRIMARY KEY DEFAULT 'default',
  encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE site_ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE site_ai_settings FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE site_ai_settings FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE site_ai_settings FROM authenticated;
  END IF;
END;
$$;
