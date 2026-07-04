alter table vocabulary_words
  add column context_sentences jsonb,
  alter column flashcard_sentence drop not null;
