CREATE TABLE term_list (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  UNIQUE (user_id, term_id)
);

ALTER TABLE term_list ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE term_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "term_list_owner" ON term_list
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
