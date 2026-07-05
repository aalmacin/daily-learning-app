ALTER TABLE vocabulary_words
  ADD COLUMN interval_step INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN next_review   TIMESTAMPTZ,
  ADD COLUMN last_reviewed TIMESTAMPTZ;
CREATE INDEX idx_vocabulary_words_user_next_review
  ON vocabulary_words(user_id, next_review);
