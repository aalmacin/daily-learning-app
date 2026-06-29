create table vocabulary_words (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  type text not null check (type in ('word', 'idiom')),
  definition text not null,
  context text not null,
  connections text not null,
  morphology text not null,
  flashcard_sentence text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vocabulary_words_user_id_idx on vocabulary_words(user_id);
create index vocabulary_words_type_idx on vocabulary_words(user_id, type);

alter table vocabulary_words enable row level security;

create policy "Users can manage their own vocabulary words"
  on vocabulary_words
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
