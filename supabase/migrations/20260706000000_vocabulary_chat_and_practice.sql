create table vocabulary_chats (
  id bigint generated always as identity primary key,
  word_id bigint not null references vocabulary_words(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index vocabulary_chats_word_id_idx on vocabulary_chats(word_id);

alter table vocabulary_chats enable row level security;

create policy "Users can manage their own vocabulary chats"
  on vocabulary_chats
  for all
  using (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_chats.word_id
      and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_chats.word_id
      and w.user_id = auth.uid()
    )
  );

create table vocabulary_sentence_attempts (
  id bigint generated always as identity primary key,
  word_id bigint not null references vocabulary_words(id) on delete cascade,
  sentence text not null,
  is_correct boolean not null,
  feedback text not null,
  created_at timestamptz not null default now()
);

create index vocabulary_sentence_attempts_word_id_idx on vocabulary_sentence_attempts(word_id);

alter table vocabulary_sentence_attempts enable row level security;

create policy "Users can manage their own vocabulary sentence attempts"
  on vocabulary_sentence_attempts
  for all
  using (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_sentence_attempts.word_id
      and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from vocabulary_words w
      where w.id = vocabulary_sentence_attempts.word_id
      and w.user_id = auth.uid()
    )
  );
