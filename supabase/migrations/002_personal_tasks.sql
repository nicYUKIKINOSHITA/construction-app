CREATE TABLE personal_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE personal_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON personal_tasks FOR ALL USING (true) WITH CHECK (true);
