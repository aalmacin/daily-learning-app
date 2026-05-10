-- supabase/migrations/20260510000001_add_indexes.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_terms_name_trgm ON terms USING GIN (name gin_trgm_ops);
CREATE INDEX idx_terms_created_at ON terms (created_at DESC);
CREATE INDEX idx_term_categories_term_id ON term_categories (term_id);
CREATE INDEX idx_term_categories_category_id ON term_categories (category_id);
CREATE INDEX idx_concept_refinements_term_id ON concept_refinements (term_id);
CREATE INDEX idx_concept_refinements_formatted_note ON concept_refinements (refinement_formatted_note)
  WHERE refinement_formatted_note IS NOT NULL;
