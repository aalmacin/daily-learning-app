-- Adds AI image columns to vocabulary_words.
alter table vocabulary_words
  add column if not exists image_url text,
  add column if not exists image_prompt text,
  add column if not exists image_model text;

-- Public-read storage bucket for generated flashcard images.
insert into storage.buckets (id, name, public)
values ('vocabulary-images', 'vocabulary-images', true)
on conflict (id) do nothing;
