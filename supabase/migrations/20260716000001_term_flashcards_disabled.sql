ALTER TABLE terms ADD COLUMN IF NOT EXISTS flashcards_disabled boolean NOT NULL DEFAULT false;
