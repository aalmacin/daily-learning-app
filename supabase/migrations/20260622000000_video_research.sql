CREATE TABLE video_research (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  error TEXT,
  raw_transcript TEXT,
  ai_transcript TEXT,
  summary TEXT,
  key_takeaways JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_research_term_id ON video_research(term_id);
CREATE INDEX idx_video_research_user_id ON video_research(user_id);

ALTER TABLE video_research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own video research"
  ON video_research
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
