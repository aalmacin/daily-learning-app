import { createClient } from '@supabase/supabase-js';
import { cache } from 'react';

export type Priority = 'High' | 'Medium' | 'Low';

export type UserSettings = {
  user_id: string;
  notion_api_key: string | null;
  notion_database_id: string | null;
  timezone: string;
  updated_at: string;
};

export type Term = {
  id: number;
  name: string;
  content: string;
  categories: string[];
  created_at: string;
  updated_at: string;
  notion_page_id: string | null;
  notion_last_edited: string | null;
  last_synced_at: string | null;
  priority: Priority;
  explained: boolean;
  daily_learning_done: boolean;
  notion_date: string | null;
};

export type Category = {
  id: number;
  name: string;
};

export type ConceptRefinement = {
  id: number;
  term_id: number;
  pre_refinement: string;
  pre_refinement_accuracy: number | null;
  pre_refinement_review: string | null;
  refinement: string | null;
  refinement_accuracy: number | null;
  refinement_review: string | null;
  refinement_formatted_note: string | null;
  refinement_additional_note: string | null;
  created_at: string;
};

export type TermsQuery = {
  userId: string;
  page: number;
  pageSize: number;
  q?: string;
  categoryNames?: string[];
  notion?: 'pending' | 'added' | 'all';
  priority?: Priority | 'all';
  dailyLearning?: 'all' | 'done' | 'not-done';
  sort?: 'created_at' | 'name' | 'priority';
  dir?: 'asc' | 'desc';
};

export type TermsPage = {
  terms: Term[];
  total: number;
};

type TermRow = Omit<Term, 'categories' | 'explained'>;

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase(): ReturnType<typeof createClient> {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  _supabase = createClient(url, key);
  return _supabase;
}

async function getCategoriesForTerm(termId: number): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from('term_categories')
    .select('category_id')
    .eq('term_id', termId);
  if (error) throw error;
  if (!data || data.length === 0) return [];
  const ids = (data as { category_id: number }[]).map((r) => r.category_id);
  const { data: cats, error: catsError } = await getSupabase()
    .from('categories')
    .select('name')
    .in('id', ids)
    .order('name');
  if (catsError) throw catsError;
  return (cats as { name: string }[]).map((c) => c.name);
}

async function upsertCategories(names: string[], userId: string): Promise<number[]> {
  if (names.length === 0) return [];
  const { data: existing, error: selectError } = await getSupabase()
    .from('categories')
    .select('id, name')
    .in('name', names)
    .eq('user_id', userId);
  if (selectError) throw selectError;

  const existingMap = new Map((existing as Category[]).map((c) => [c.name, c.id]));
  const missing = names.filter((n) => !existingMap.has(n));

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await getSupabase()
      .from('categories')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(missing.map((name) => ({ name, user_id: userId })) as any)
      .select('id, name');
    if (insertError) throw insertError;
    for (const cat of inserted as Category[]) {
      existingMap.set(cat.name, cat.id);
    }
  }

  return names.map((n) => existingMap.get(n)).filter((id): id is number => id !== undefined);
}

async function setTermCategories(termId: number, categoryIds: number[]): Promise<void> {
  const { error: deleteError } = await getSupabase()
    .from('term_categories')
    .delete()
    .eq('term_id', termId);
  if (deleteError) throw deleteError;
  if (categoryIds.length === 0) return;
  const { error } = await getSupabase()
    .from('term_categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(categoryIds.map((category_id) => ({ term_id: termId, category_id })) as any);
  if (error) throw error;
}

async function isTermExplained(termId: number): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('concept_refinements')
    .select('id')
    .eq('term_id', termId)
    .not('refinement_formatted_note', 'is', null)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getTermsPaginated({
  userId,
  page,
  pageSize,
  q,
  categoryNames,
  notion,
  priority,
  dailyLearning,
  sort = 'created_at',
  dir = 'desc',
}: TermsQuery): Promise<TermsPage> {
  const offset = (page - 1) * pageSize;

  // Resolve category names → term IDs (OR logic)
  let termIdFilter: number[] | null = null;
  if (categoryNames && categoryNames.length > 0) {
    const { data: cats, error: catError } = await getSupabase()
      .from('categories')
      .select('id')
      .in('name', categoryNames)
      .eq('user_id', userId);
    if (catError) throw catError;
    const catIds = (cats as { id: number }[]).map((c) => c.id);
    if (catIds.length === 0) return { terms: [], total: 0 };

    const { data: links, error: linkError } = await getSupabase()
      .from('term_categories')
      .select('term_id')
      .in('category_id', catIds);
    if (linkError) throw linkError;
    termIdFilter = [...new Set((links as { term_id: number }[]).map((l) => l.term_id))];
    if (termIdFilter.length === 0) return { terms: [], total: 0 };
  }

  // Use a single query with joined categories and count
  let query = getSupabase()
    .from('terms')
    .select('*, term_categories(categories(name)), concept_refinements!left(term_id)', { count: 'exact' })
    .eq('user_id', userId);
  if (q) query = query.ilike('name', `%${q}%`);
  if (notion === 'pending') query = query.is('notion_page_id', null);
  if (notion === 'added') query = query.not('notion_page_id', 'is', null);
  if (priority && priority !== 'all') query = query.eq('priority', priority);
  if (dailyLearning === 'done') query = query.eq('daily_learning_done', true);
  if (dailyLearning === 'not-done') query = query.eq('daily_learning_done', false);
  if (termIdFilter !== null) query = query.in('id', termIdFilter);
  query = query
    .not('concept_refinements.refinement_formatted_note', 'is', null)
    .order(sort, { ascending: dir === 'asc' })
    .range(offset, offset + pageSize - 1);

  const { data: rows, count, error } = await query;
  if (error) throw error;

  const total = count ?? 0;
  if (!rows || rows.length === 0) return { terms: [], total };

  type JoinedRow = TermRow & {
    term_categories: { categories: { name: string } | null }[];
    concept_refinements: { term_id: number }[];
  };

  return {
    terms: (rows as unknown as JoinedRow[]).map((row) => {
      const categories = row.term_categories
        .map((tc) => tc.categories?.name)
        .filter((name): name is string => name != null);
      const explained = row.concept_refinements.length > 0;
      const { term_categories: _, concept_refinements: __, ...termRow } = row;
      return { ...termRow, categories, explained };
    }),
    total,
  };
}

export const getAllCategories = cache(async (userId: string): Promise<Category[]> => {
  const { data, error } = await getSupabase().from('categories').select('*').eq('user_id', userId).order('name');
  if (error) throw error;
  return data as Category[];
});

export async function getTerm(name: string, userId: string): Promise<Term | null> {
  const { data, error } = await getSupabase()
    .from('terms')
    .select('*')
    .ilike('name', name)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as TermRow;
  const [categories, explained] = await Promise.all([
    getCategoriesForTerm(row.id),
    isTermExplained(row.id),
  ]);
  return { ...row, categories, explained };
}

export async function getAllTerms(userId: string): Promise<Term[]> {
  const { data: rows, error } = await getSupabase()
    .from('terms')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  if (!rows || rows.length === 0) return [];

  const rowIds = (rows as TermRow[]).map((r) => r.id);

  const [catLinksResult, explainedResult] = await Promise.all([
    getSupabase()
      .from('term_categories')
      .select('term_id, categories(name)')
      .in('term_id', rowIds),
    getSupabase()
      .from('concept_refinements')
      .select('term_id')
      .in('term_id', rowIds)
      .not('refinement_formatted_note', 'is', null),
  ]);
  if (catLinksResult.error) throw catLinksResult.error;
  if (explainedResult.error) throw explainedResult.error;

  const catMap = new Map<number, string[]>();
  for (const link of catLinksResult.data as unknown as { term_id: number; categories: { name: string } | null }[]) {
    if (!link.categories) continue;
    if (!catMap.has(link.term_id)) catMap.set(link.term_id, []);
    catMap.get(link.term_id)!.push(link.categories.name);
  }

  const explainedIds = new Set((explainedResult.data as { term_id: number }[]).map((r) => r.term_id));

  return (rows as TermRow[]).map((row) => ({
    ...row,
    categories: catMap.get(row.id) ?? [],
    explained: explainedIds.has(row.id),
  }));
}

export async function insertTerm(term: Omit<Term, 'id' | 'created_at' | 'explained'>, userId: string): Promise<Term> {
  const { data, error } = await getSupabase()
    .from('terms')
    .insert({
      name: term.name,
      content: term.content,
      notion_page_id: term.notion_page_id ?? null,
      priority: term.priority ?? 'Medium',
      user_id: userId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select()
    .single();
  if (error) throw error;
  const row = data as TermRow;
  const categoryIds = await upsertCategories(term.categories, userId);
  await setTermCategories(row.id, categoryIds);
  return { ...row, categories: term.categories, explained: false };
}

export async function updateTerm(
  id: number,
  updates: Partial<Omit<Term, 'id' | 'created_at' | 'updated_at' | 'notion_last_edited' | 'last_synced_at' | 'explained' | 'daily_learning_done' | 'notion_date'>>,
  userId?: string,
): Promise<Term | null> {
  const fields: Partial<TermRow> = {};
  if (updates.name !== undefined) fields.name = updates.name;
  if (updates.content !== undefined) fields.content = updates.content;
  if (updates.notion_page_id !== undefined) fields.notion_page_id = updates.notion_page_id;
  if (updates.priority !== undefined) fields.priority = updates.priority;

  let row: TermRow;
  if (Object.keys(fields).length > 0) {
    const { data, error } = await getSupabase()
      .from('terms')
      .update(fields as unknown as never)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    row = data as TermRow;
  } else {
    const { data, error } = await getSupabase()
      .from('terms')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    row = data as TermRow;
  }

  if (updates.categories !== undefined && userId) {
    const categoryIds = await upsertCategories(updates.categories, userId);
    await setTermCategories(row.id, categoryIds);
  }

  const [categories, explained] = await Promise.all([
    getCategoriesForTerm(row.id),
    isTermExplained(row.id),
  ]);
  return { ...row, categories, explained };
}

export async function deleteTerm(id: number): Promise<void> {
  const { error } = await getSupabase().from('terms').delete().eq('id', id);
  if (error) throw error;
}

export async function insertCategory(name: string, userId: string): Promise<Category> {
  const { data: existing } = await getSupabase()
    .from('categories')
    .select('*')
    .eq('name', name)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return existing as Category;
  const { data, error } = await getSupabase()
    .from('categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ name, user_id: userId } as any)
    .select()
    .single();
  if (error) throw error;
  return data as Category;
}

export async function deleteCategory(id: number): Promise<void> {
  const { error } = await getSupabase().from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function updateTermCategories(
  termId: number,
  categories: string[],
  userId: string,
): Promise<Term | null> {
  return updateTerm(termId, { categories }, userId);
}

export const getTermById = cache(async (id: number): Promise<Term | null> => {
  const { data, error } = await getSupabase()
    .from('terms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as TermRow;
  const [categories, explained] = await Promise.all([
    getCategoriesForTerm(row.id),
    isTermExplained(row.id),
  ]);
  return { ...row, categories, explained };
});

export const getRefinementsByTermId = cache(async (termId: number): Promise<ConceptRefinement[]> => {
  const { data, error } = await getSupabase()
    .from('concept_refinements')
    .select('*')
    .eq('term_id', termId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ConceptRefinement[];
});

export async function getRefinementById(id: number): Promise<ConceptRefinement | null> {
  const { data, error } = await getSupabase()
    .from('concept_refinements')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ConceptRefinement | null) ?? null;
}

export async function createRefinement(termId: number, preRefinement: string): Promise<ConceptRefinement> {
  const { data, error } = await getSupabase()
    .from('concept_refinements')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ term_id: termId, pre_refinement: preRefinement } as any)
    .select()
    .single();
  if (error) throw error;
  return data as ConceptRefinement;
}

export async function updatePreRefinementResult(
  id: number,
  accuracy: number,
  review: string,
): Promise<ConceptRefinement> {
  const { data, error } = await getSupabase()
    .from('concept_refinements')
    .update({ pre_refinement_accuracy: accuracy, pre_refinement_review: review } as unknown as never)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ConceptRefinement;
}

export async function setPreRefinement(
  id: number,
  preRefinement: string,
  accuracy: number,
  review: string,
): Promise<ConceptRefinement> {
  const { data, error } = await getSupabase()
    .from('concept_refinements')
    .update({ pre_refinement: preRefinement, pre_refinement_accuracy: accuracy, pre_refinement_review: review } as unknown as never)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ConceptRefinement;
}

export async function updateRefinementData(
  id: number,
  data: {
    refinement: string;
    refinement_accuracy: number;
    refinement_review: string;
    refinement_formatted_note: string;
    refinement_additional_note: string;
  },
): Promise<ConceptRefinement> {
  const { data: updated, error } = await getSupabase()
    .from('concept_refinements')
    .update(data as unknown as never)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return updated as ConceptRefinement;
}

export async function deleteConceptRefinement(id: number): Promise<void> {
  const { error } = await getSupabase().from('concept_refinements').delete().eq('id', id);
  if (error) throw error;
}

export type ChatMessage = {
  id: number;
  refinement_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type Flashcard = {
  id: number;
  term_id: number;
  content: string;
  interval_step: number;
  next_review: string | null;
  last_reviewed: string | null;
  created_at: string;
  user_id: string;
};

export const SRS_INTERVALS = [1, 3, 7, 14, 30, 60] as const;

export async function getChatsByRefinementId(refinementId: number): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from('research_chats')
    .select('*')
    .eq('refinement_id', refinementId)
    .order('id', { ascending: true });
  if (error) throw error;
  return data as ChatMessage[];
}

export async function getChatsByRefinementIds(refinementIds: number[]): Promise<Record<number, ChatMessage[]>> {
  if (refinementIds.length === 0) return {};
  const { data, error } = await getSupabase()
    .from('research_chats')
    .select('*')
    .in('refinement_id', refinementIds)
    .order('id', { ascending: true });
  if (error) throw error;
  const result: Record<number, ChatMessage[]> = {};
  for (const row of data as ChatMessage[]) {
    if (!result[row.refinement_id]) result[row.refinement_id] = [];
    result[row.refinement_id].push(row);
  }
  return result;
}

export async function insertChatMessages(
  messages: Array<{ refinement_id: number; role: 'user' | 'assistant'; content: string }>,
): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from('research_chats')
    .insert(messages as unknown as never)
    .select();
  if (error) throw error;
  return data as ChatMessage[];
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const { data, error } = await getSupabase()
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserSettings | null;
}

export async function upsertUserSettings(
  userId: string,
  settings: { notion_api_key: string | null; notion_database_id: string | null },
): Promise<UserSettings> {
  const { data, error } = await getSupabase()
    .from('user_settings')
    .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() } as unknown as never)
    .select()
    .single();
  if (error) throw error;
  return data as UserSettings;
}

export async function updateNotionDatabaseId(userId: string, databaseId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('user_settings')
    .update({ notion_database_id: databaseId, updated_at: new Date().toISOString() } as unknown as never)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateTimezone(userId: string, timezone: string): Promise<void> {
  const { error } = await getSupabase()
    .from('user_settings')
    .upsert({ user_id: userId, timezone, updated_at: new Date().toISOString() } as unknown as never);
  if (error) throw error;
}

export async function clearNotionCredentials(userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('user_settings')
    .update({ notion_api_key: null, notion_database_id: null, updated_at: new Date().toISOString() } as unknown as never)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function setTermNotionDate(termId: number, date: string): Promise<void> {
  const { error } = await getSupabase()
    .from('terms')
    .update({ notion_date: date } as unknown as never)
    .eq('id', termId);
  if (error) throw error;
}

export async function markTermSynced(
  termId: number,
  notionLastEdited: string,
  dailyLearningDone: boolean,
  notionDate: string | null,
): Promise<void> {
  const { error } = await getSupabase()
    .from('terms')
    .update({
      notion_last_edited: notionLastEdited,
      last_synced_at: new Date().toISOString(),
      daily_learning_done: dailyLearningDone,
      notion_date: notionDate,
    } as unknown as never)
    .eq('id', termId);
  if (error) throw error;
}

export type ReviewItem = {
  term_id: number;
  term_name: string;
  notion_date: string;
  notion_content: string | null;
  categories: string[];
};

export type TermListItem = {
  id: number;
  user_id: string;
  term_id: number;
  position: number;
  term: Term;
};

export async function getExplainedAtForTerm(termId: number): Promise<string | null> {
  const { data } = await getSupabase()
    .from('term_explained_content')
    .select('explained_at')
    .eq('term_id', termId)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data as { explained_at: string }[] | null)?.[0]?.explained_at ?? null;
}

export async function getExplainedContent(
  termIds: number[],
): Promise<{ term_id: number; id: number; explained_at: string; notion_last_edited: string | null }[]> {
  if (termIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from('term_explained_content')
    .select('id, term_id, explained_at, notion_last_edited')
    .in('term_id', termIds);
  if (error) throw error;
  return data as { term_id: number; id: number; explained_at: string; notion_last_edited: string | null }[];
}

export async function updateExplainedContent(
  id: number,
  notionContent: string,
  explainedAt: string,
  notionLastEdited: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('term_explained_content')
    .update({ notion_content: notionContent, explained_at: explainedAt, notion_last_edited: notionLastEdited } as unknown as never)
    .eq('id', id);
  if (error) throw error;
}

export async function insertExplainedContent(
  termId: number,
  notionContent: string,
  explainedAt: string,
  notionLastEdited: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('term_explained_content')
    .insert({ term_id: termId, notion_content: notionContent, explained_at: explainedAt, notion_last_edited: notionLastEdited } as unknown as never);
  if (error) throw error;
}

export async function getReviewItemsByMonth(year: number, month: number, userId: string): Promise<ReviewItem[]> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const startDate = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${pad(nextMonth)}-01`;

  const { data, error } = await getSupabase()
    .from('terms')
    .select('id, name, notion_date, term_explained_content(notion_content)')
    .eq('user_id', userId)
    .eq('daily_learning_done', true)
    .not('notion_date', 'is', null)
    .gte('notion_date', startDate)
    .lt('notion_date', endDate)
    .order('notion_date', { ascending: true });
  if (error) throw error;

  const rows = data as unknown as {
    id: number;
    name: string;
    notion_date: string;
    term_explained_content: { notion_content: string }[] | null;
  }[];

  const termIds = rows.map((r) => r.id);
  const catMap = new Map<number, string[]>();

  if (termIds.length > 0) {
    const { data: catLinks, error: catError } = await getSupabase()
      .from('term_categories')
      .select('term_id, category_id')
      .in('term_id', termIds);
    if (catError) throw catError;

    if (catLinks && catLinks.length > 0) {
      const typedLinks = catLinks as { term_id: number; category_id: number }[];
      const categoryIds = [...new Set(typedLinks.map((l) => l.category_id))];
      const { data: cats, error: catsError } = await getSupabase()
        .from('categories')
        .select('id, name')
        .in('id', categoryIds);
      if (catsError) throw catsError;
      const catNameById = new Map((cats as { id: number; name: string }[]).map((c) => [c.id, c.name]));
      for (const link of typedLinks) {
        const name = catNameById.get(link.category_id);
        if (!name) continue;
        if (!catMap.has(link.term_id)) catMap.set(link.term_id, []);
        catMap.get(link.term_id)!.push(name);
      }
    }
  }

  return rows.map((row) => ({
    term_id: row.id,
    term_name: row.name,
    notion_date: row.notion_date,
    notion_content: row.term_explained_content?.[0]?.notion_content ?? null,
    categories: catMap.get(row.id) ?? [],
  }));
}

export async function getAvailableReviewMonths(userId: string): Promise<{ year: number; month: number }[]> {
  const { data, error } = await getSupabase()
    .from('terms')
    .select('notion_date')
    .eq('user_id', userId)
    .eq('daily_learning_done', true)
    .not('notion_date', 'is', null)
    .order('notion_date', { ascending: false });
  if (error) throw error;

  const seen = new Set<string>();
  const months: { year: number; month: number }[] = [];
  for (const row of data as { notion_date: string }[]) {
    const [yearStr, monthStr] = row.notion_date.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const key = `${year}-${month}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push({ year, month });
    }
  }
  return months;
}

export async function getTermListTermIds(userId: string): Promise<number[]> {
  const { data, error } = await getSupabase()
    .from('term_list')
    .select('term_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data as { term_id: number }[]).map((r) => r.term_id);
}

export async function getTermList(userId: string): Promise<TermListItem[]> {
  const { data: rows, error } = await getSupabase()
    .from('term_list')
    .select('*, terms(*)')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  type TermListRow = { id: number; user_id: string; term_id: number; position: number; terms: TermRow };
  const typedRows = rows as unknown as TermListRow[];
  const termIds = typedRows.map((r) => r.term_id);

  const [catLinksResult, explainedResult] = await Promise.all([
    getSupabase()
      .from('term_categories')
      .select('term_id, categories(name)')
      .in('term_id', termIds),
    getSupabase()
      .from('concept_refinements')
      .select('term_id')
      .in('term_id', termIds)
      .not('refinement_formatted_note', 'is', null),
  ]);
  if (catLinksResult.error) throw catLinksResult.error;
  if (explainedResult.error) throw explainedResult.error;

  const catMap = new Map<number, string[]>();
  for (const link of catLinksResult.data as unknown as { term_id: number; categories: { name: string } | null }[]) {
    if (!link.categories) continue;
    if (!catMap.has(link.term_id)) catMap.set(link.term_id, []);
    catMap.get(link.term_id)!.push(link.categories.name);
  }

  const explainedIds = new Set((explainedResult.data as { term_id: number }[]).map((r) => r.term_id));

  return typedRows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    term_id: row.term_id,
    position: row.position,
    term: {
      ...row.terms,
      categories: catMap.get(row.term_id) ?? [],
      explained: explainedIds.has(row.term_id),
    },
  }));
}

export async function addTermToList(termId: number, userId: string): Promise<void> {
  // Remove any existing entry for this term
  const { error: deleteError } = await getSupabase()
    .from('term_list')
    .delete()
    .eq('term_id', termId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  // Get the current max position
  const { data: items, error } = await getSupabase()
    .from('term_list')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);
  if (error) throw error;

  const maxPosition = items.length > 0 ? (items[0] as { position: number }).position : 0;

  // Insert new term at the end
  const { error: insertError } = await getSupabase()
    .from('term_list')
    .insert({ term_id: termId, user_id: userId, position: maxPosition + 1 } as unknown as never);
  if (insertError) throw insertError;
}

export async function removeFromTermList(id: number, userId: string): Promise<void> {
  const { data: item, error: fetchError } = await getSupabase()
    .from('term_list')
    .select('position')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!item) return;

  const removedPosition = (item as { position: number }).position;

  await getSupabase().from('term_list').delete().eq('id', id).eq('user_id', userId);

  const { data: below, error: belowError } = await getSupabase()
    .from('term_list')
    .select('id, position')
    .eq('user_id', userId)
    .gt('position', removedPosition);
  if (belowError) throw belowError;

  await Promise.all(
    (below as { id: number; position: number }[]).map((row) =>
      getSupabase()
        .from('term_list')
        .update({ position: row.position - 1 } as unknown as never)
        .eq('id', row.id)
    )
  );
}

export async function removeFromTermListByTermId(termId: number, userId: string): Promise<void> {
  const { data: item, error: fetchError } = await getSupabase()
    .from('term_list')
    .select('id')
    .eq('term_id', termId)
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!item) return;
  await removeFromTermList((item as { id: number }).id, userId);
}

export async function reorderTermList(orderedIds: number[], userId: string): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      getSupabase()
        .from('term_list')
        .update({ position: index + 1 } as unknown as never)
        .eq('id', id)
        .eq('user_id', userId)
    )
  );
  for (const result of results) {
    if (result.error) throw result.error;
  }
}

export async function getFlashcardsByTermId(termId: number, userId: string): Promise<Flashcard[]> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .select('*')
    .eq('term_id', termId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Flashcard[];
}

export async function createFlashcard(termId: number, content: string, userId: string): Promise<Flashcard> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .insert({ term_id: termId, content, user_id: userId } as unknown as never)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}

export async function updateFlashcard(id: number, content: string, userId: string): Promise<Flashcard> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .update({ content } as unknown as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}

export async function deleteFlashcard(id: number, userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('flashcards')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function resetFlashcardReview(id: number, userId: string): Promise<Flashcard> {
  const { data, error } = await getSupabase()
    .from('flashcards')
    .update({ interval_step: 0, next_review: null, last_reviewed: null } as unknown as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}

export async function getDueFlashcards(userId: string, categoryNames?: string[]): Promise<(Flashcard & { term_name: string })[]> {
  let termIdFilter: number[] | null = null;
  if (categoryNames && categoryNames.length > 0) {
    const { data: cats, error: catError } = await getSupabase()
      .from('categories')
      .select('id')
      .in('name', categoryNames)
      .eq('user_id', userId);
    if (catError) throw catError;
    const catIds = (cats as { id: number }[]).map((c) => c.id);
    if (catIds.length === 0) return [];
    const { data: links, error: linkError } = await getSupabase()
      .from('term_categories')
      .select('term_id')
      .in('category_id', catIds);
    if (linkError) throw linkError;
    termIdFilter = [...new Set((links as { term_id: number }[]).map((l) => l.term_id))];
    if (termIdFilter.length === 0) return [];
  }

  let query = getSupabase()
    .from('flashcards')
    .select('*, terms(name)')
    .eq('user_id', userId)
    .not('next_review', 'is', null)
    .lte('next_review', new Date().toISOString());
  if (termIdFilter) query = query.in('term_id', termIdFilter);
  query = query.order('next_review', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as (Flashcard & { terms: { name: string } })[]).map((row) => {
    const { terms, ...rest } = row;
    return { ...rest, term_name: terms.name };
  });
}

export async function getNewFlashcards(userId: string, categoryNames?: string[]): Promise<(Flashcard & { term_name: string })[]> {
  let termIdFilter: number[] | null = null;
  if (categoryNames && categoryNames.length > 0) {
    const { data: cats, error: catError } = await getSupabase()
      .from('categories')
      .select('id')
      .in('name', categoryNames)
      .eq('user_id', userId);
    if (catError) throw catError;
    const catIds = (cats as { id: number }[]).map((c) => c.id);
    if (catIds.length === 0) return [];
    const { data: links, error: linkError } = await getSupabase()
      .from('term_categories')
      .select('term_id')
      .in('category_id', catIds);
    if (linkError) throw linkError;
    termIdFilter = [...new Set((links as { term_id: number }[]).map((l) => l.term_id))];
    if (termIdFilter.length === 0) return [];
  }

  let query = getSupabase()
    .from('flashcards')
    .select('*, terms(name)')
    .eq('user_id', userId)
    .is('next_review', null);
  if (termIdFilter) query = query.in('term_id', termIdFilter);

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as (Flashcard & { terms: { name: string } })[]).map((row) => {
    const { terms, ...rest } = row;
    return { ...rest, term_name: terms.name };
  });
}

function getStartOfDay(timezone?: string): Date {
  const now = new Date();
  const tz = timezone || 'UTC';
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz });
  return new Date(`${dateStr}T00:00:00`);
}


export async function reviewFlashcard(id: number, userId: string, correct: boolean, timezone?: string): Promise<Flashcard> {
  const { data: card, error: fetchError } = await getSupabase()
    .from('flashcards')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (fetchError) throw fetchError;

  const current = card as Flashcard;
  let newStep: number;
  if (correct) {
    newStep = Math.min(current.interval_step + 1, SRS_INTERVALS.length - 1);
  } else {
    newStep = 0;
  }

  const intervalDays = SRS_INTERVALS[newStep];
  const startOfToday = getStartOfDay(timezone);
  const nextReview = new Date(startOfToday);
  nextReview.setDate(nextReview.getDate() + intervalDays);

  const { data, error } = await getSupabase()
    .from('flashcards')
    .update({
      interval_step: newStep,
      next_review: nextReview.toISOString(),
      last_reviewed: new Date().toISOString(),
    } as unknown as never)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as Flashcard;
}
