ALTER TABLE vocabulary_words ADD COLUMN IF NOT EXISTS flashcards_disabled boolean NOT NULL DEFAULT false;
