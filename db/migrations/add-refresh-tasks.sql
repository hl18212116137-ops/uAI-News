CREATE TABLE IF NOT EXISTS refresh_tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refresh_tasks_updated_at_idx
  ON refresh_tasks (updated_at DESC);

ALTER TABLE refresh_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE refresh_tasks FROM anon, authenticated;
