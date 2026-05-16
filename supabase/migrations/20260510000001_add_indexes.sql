-- supabase/migrations/20260510000001_add_indexes.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Terms: search, sort, and filter
CREATE INDEX IF NOT EXISTS idx_terms_name_trgm ON terms USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_terms_user_created ON terms (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terms_user_priority ON terms (user_id, priority);
CREATE INDEX IF NOT EXISTS idx_terms_user_daily_notion ON terms (user_id, daily_learning_done, notion_date);

-- Foreign key indexes (term_categories.term_id already covered by composite PK)
CREATE INDEX IF NOT EXISTS idx_term_categories_category_id ON term_categories (category_id);
CREATE INDEX IF NOT EXISTS idx_concept_refinements_term_id ON concept_refinements (term_id);
CREATE INDEX IF NOT EXISTS idx_term_explained_content_term_id ON term_explained_content (term_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_chats_refinement_order ON research_chats (refinement_id, id ASC);

-- Partial index: fast "is explained" check
CREATE INDEX IF NOT EXISTS idx_concept_refinements_explained ON concept_refinements (term_id)
  WHERE refinement_formatted_note IS NOT NULL;

-- Term list
CREATE INDEX IF NOT EXISTS idx_term_list_user_position ON term_list (user_id, position);
CREATE INDEX IF NOT EXISTS idx_term_list_term_id ON term_list (term_id);
