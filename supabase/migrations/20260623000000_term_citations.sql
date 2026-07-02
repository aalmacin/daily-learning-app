CREATE TABLE IF NOT EXISTS term_citations (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (term_id, url)
);

ALTER TABLE term_citations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "term_citations_owner" ON term_citations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM terms t
      WHERE t.id = term_citations.term_id
      AND t.user_id = auth.uid()
    )
  );
