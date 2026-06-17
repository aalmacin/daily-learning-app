-- supabase/migrations/20260613000000_add_term_notes.sql
ALTER TABLE terms ADD COLUMN notes TEXT;
