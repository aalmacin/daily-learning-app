CREATE TABLE flashcards (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  interval_step INTEGER NOT NULL DEFAULT 0,
  next_review TIMESTAMPTZ,
  last_reviewed TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_flashcards_user_next_review ON flashcards(user_id, next_review);
CREATE INDEX idx_flashcards_term_id ON flashcards(term_id);

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own flashcards"
  ON flashcards
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
