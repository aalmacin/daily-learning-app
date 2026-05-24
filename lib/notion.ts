import { Client } from '@notionhq/client';
import type {
  BlockObjectRequest,
  BlockObjectResponse,
  DataSourceObjectResponse,
  PageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import type { ChatMessage, Priority } from '@/lib/db';

type NotionCredentials = { apiKey: string; databaseId: string };

// Notion allows ~3 req/s. Enforce 400ms between calls to stay safely under the limit.
const NOTION_REQUEST_INTERVAL_MS = 400;
let lastNotionRequestTime = 0;

async function throttleNotion(): Promise<void> {
  const now = Date.now();
  const wait = NOTION_REQUEST_INTERVAL_MS - (now - lastNotionRequestTime);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNotionRequestTime = Date.now();
}

function getClient(credentials: NotionCredentials) {
  return new Client({ auth: credentials.apiKey, retry: { maxRetries: 5 } });
}

export async function createNotionPage(
  credentials: NotionCredentials,
  term: {
    name: string;
    content: string;
    categories: string[];
    priority: string;
  },
): Promise<string> {
  const client = getClient(credentials);
  await throttleNotion();
  const response = await client.pages.create({
    parent: { data_source_id: credentials.databaseId },
    properties: {
      Study: {
        title: [{ text: { content: term.name } }],
      },
      Category: {
        multi_select: term.categories.map((category) => ({ name: category })),
      },
      Priority: {
        select: { name: term.priority },
      },
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: term.content } }],
        },
      },
    ],
  });

  return response.id;
}

type RichTextItem = {
  type: 'text';
  text: { content: string };
  annotations?: { bold: true };
};

function parseInlineBold(text: string): RichTextItem[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts
    .filter((p) => p.length > 0)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? { type: 'text' as const, text: { content: part.slice(2, -2) }, annotations: { bold: true as const } }
        : { type: 'text' as const, text: { content: part } },
    );
}

function parseMarkdownToNotionBlocks(markdown: string): BlockObjectRequest[] {
  return markdown
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line): BlockObjectRequest => {
      if (line.startsWith('- ')) {
        return {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: parseInlineBold(line.slice(2)) },
        };
      }
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: parseInlineBold(line) },
      };
    });
}

export type NotionPageSummary = {
  id: string;
  name: string;
  categories: string[];
  priority: Priority;
  dailyLearningDone: boolean;
  date: string | null;
  lastEditedTime: string;
};

export async function getAllNotionPages(credentials: NotionCredentials): Promise<NotionPageSummary[]> {
  const client = getClient(credentials);
  const pages: NotionPageSummary[] = [];
  let cursor: string | undefined;

  do {
    const response = await client.dataSources.query({
      data_source_id: credentials.databaseId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const result of response.results) {
      if (!('properties' in result)) continue;
      const page = result as PageObjectResponse;

      const titleProp = page.properties['Study'];
      const name =
        titleProp?.type === 'title' ? titleProp.title.map((t) => t.plain_text).join('') : '';
      if (!name) continue;

      const categoryProp = page.properties['Category'];
      const categories =
        categoryProp?.type === 'multi_select' ? categoryProp.multi_select.map((c) => c.name) : [];

      const priorityProp = page.properties['Priority'];
      const rawPriority = priorityProp?.type === 'select' ? priorityProp.select?.name : undefined;
      const priority: Priority =
        rawPriority === 'High' || rawPriority === 'Low' ? rawPriority : 'Medium';

      const checkboxProp = page.properties['Daily Learning Done'];
      const dailyLearningDone = checkboxProp?.type === 'checkbox' ? checkboxProp.checkbox : false;

      const dateProp = page.properties['Date'];
      const date = dateProp?.type === 'date' ? dateProp.date?.start ?? null : null;

      pages.push({ id: page.id, name, categories, priority, dailyLearningDone, date, lastEditedTime: page.last_edited_time });
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  return pages;
}

export async function getNotionPageContent(credentials: NotionCredentials, pageId: string): Promise<string> {
  const client = getClient(credentials);
  const response = await client.blocks.children.list({ block_id: pageId, page_size: 1 });
  const first = response.results[0];
  if (!first || !('type' in first) || first.type !== 'paragraph') return '';
  const block = first as BlockObjectResponse & { type: 'paragraph' };
  return block.paragraph.rich_text.map((rt) => rt.plain_text).join('');
}

export async function archiveNotionPage(credentials: NotionCredentials, pageId: string): Promise<void> {
  const client = getClient(credentials);
  await client.pages.update({ page_id: pageId, archived: true });
}

export async function unarchiveNotionPage(credentials: NotionCredentials, pageId: string): Promise<void> {
  const client = getClient(credentials);
  await client.pages.update({ page_id: pageId, archived: false });
}

export async function updateNotionPageContent(credentials: NotionCredentials, pageId: string, content: string): Promise<void> {
  const client = getClient(credentials);
  const response = await client.blocks.children.list({ block_id: pageId, page_size: 1 });
  const first = response.results[0];
  if (!first || !('type' in first) || first.type !== 'paragraph') return;
  await client.blocks.update({
    block_id: first.id,
    paragraph: { rich_text: [{ type: 'text', text: { content } }] },
  });
}

function localeDateStr(timezone: string): string {
  // 'en-CA' locale formats as YYYY-MM-DD which Notion expects
  return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
}

export async function updateNotionPageMetadata(
  credentials: NotionCredentials,
  pageId: string,
  categories: string[],
  priority: string,
): Promise<void> {
  const client = getClient(credentials);
  await client.pages.update({
    page_id: pageId,
    properties: {
      Category: { multi_select: categories.map((name) => ({ name })) },
      Priority: { select: { name: priority } },
    },
  });
}

export async function updateNotionPageDate(
  credentials: NotionCredentials,
  pageId: string,
  date: string | null,
): Promise<void> {
  const client = getClient(credentials);
  await throttleNotion();
  await client.pages.update({
    page_id: pageId,
    properties: {
      Date: { date: date ? { start: date } : null },
    },
  });
}

export async function appendRefinementToNotionPage(
  credentials: NotionCredentials,
  pageId: string,
  refinement: {
    refinement: string;
    refinement_formatted_note: string;
    refinement_additional_note: string;
  },
  termName: string,
  timezone = 'UTC',
  chats: ChatMessage[] = [],
  date?: string,
): Promise<void> {
  const client = getClient(credentials);
  const dateStr = date ?? localeDateStr(timezone);
  const formattedDate = new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  await throttleNotion();
  await client.pages.update({
    page_id: pageId,
    properties: {
      'Daily Learning Done': { checkbox: true },
      Date: { date: { start: dateStr } },
      Priority: { select: { name: 'High' } },
    },
  });

  const formattedNoteBlocks: BlockObjectRequest[] = refinement.refinement_formatted_note
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: parseInlineBold(line) },
    }));

  await throttleNotion();
  await client.blocks.children.append({
    block_id: pageId,
    children: [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ type: 'text', text: { content: `${termName} (${formattedDate})` } }],
        },
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Own Words' } }] },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: refinement.refinement } }] },
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ type: 'text', text: { content: 'Formatted' } }] },
      },
      ...formattedNoteBlocks,
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: 'Additional Notes (digital reference)' } }],
        },
      },
      ...parseMarkdownToNotionBlocks(refinement.refinement_additional_note),
      ...(chats.length > 0
        ? [
            {
              object: 'block',
              type: 'heading_2',
              heading_2: {
                rich_text: [{ type: 'text', text: { content: 'Research Q&A' } }],
                is_toggleable: true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                children: chats.map((msg) => ({
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: { content: `${msg.role === 'user' ? 'Q' : 'A'}: ${msg.content}` },
                        ...(msg.role === 'user' ? { annotations: { bold: true } } : {}),
                      },
                    ],
                  },
                })),
              },
            } as unknown as BlockObjectRequest,
          ]
        : []),
    ],
  });
}

type RichTextEntry = {
  plain_text: string;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
};

function richTextToMarkdown(richText: RichTextEntry[]): string {
  return richText
    .map((rt) => {
      let text = rt.plain_text;
      if (!rt.annotations) return text;
      if (rt.annotations.code) text = `\`${text}\``;
      if (rt.annotations.bold) text = `**${text}**`;
      if (rt.annotations.italic) text = `*${text}*`;
      if (rt.annotations.strikethrough) text = `~~${text}~~`;
      return text;
    })
    .join('');
}

function blockToMarkdown(block: BlockObjectResponse): string | null {
  const b = block as unknown as Record<string, { rich_text?: RichTextEntry[] }>;
  const section = b[block.type];
  if (!section?.rich_text) return null;

  const text = richTextToMarkdown(section.rich_text);
  switch (block.type) {
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'bulleted_list_item':
      return `- ${text}`;
    case 'numbered_list_item':
      return `1. ${text}`;
    case 'quote':
      return `> ${text}`;
    case 'to_do': {
      const todo = b[block.type] as unknown as { rich_text: RichTextEntry[]; checked?: boolean };
      return `- [${todo.checked ? 'x' : ' '}] ${text}`;
    }
    case 'divider':
      return '---';
    default:
      return text || null;
  }
}

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do']);

export async function getNotionPageFullContent(
  credentials: NotionCredentials,
  pageId: string,
): Promise<string> {
  const client = getClient(credentials);
  const entries: { type: string; md: string }[] = [];
  let cursor: string | undefined;

  do {
    await throttleNotion();
    const response = await client.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: cursor,
    });

    for (const result of response.results) {
      if (!('type' in result)) continue;
      const block = result as BlockObjectResponse;
      if (block.type === 'divider') {
        entries.push({ type: 'divider', md: '---' });
        continue;
      }
      const md = blockToMarkdown(block);
      if (md !== null) entries.push({ type: block.type, md });
    }

    cursor = response.next_cursor ?? undefined;
  } while (cursor);

  // Join with blank lines between blocks, but keep consecutive list items tight
  const parts: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    parts.push(entries[i].md);
    if (i < entries.length - 1) {
      const curIsList = LIST_TYPES.has(entries[i].type);
      const nextIsList = LIST_TYPES.has(entries[i + 1].type);
      parts.push(curIsList && nextIsList ? '\n' : '\n\n');
    }
  }
  return parts.join('');
}

export async function getNotionDatabases(
  apiKey: string,
): Promise<{ id: string; title: string }[]> {
  const client = new Client({ auth: apiKey, retry: { maxRetries: 5 } });
  await throttleNotion();
  const response = await client.search({
    filter: { value: 'data_source', property: 'object' },
    page_size: 100,
  });
  return response.results
    .filter((r): r is DataSourceObjectResponse => r.object === 'data_source')
    .map((db) => ({
      id: db.id,
      title: db.title[0]?.plain_text ?? 'Untitled',
    }));
}

export async function createNotionDataSource(
  apiKey: string,
): Promise<{ id: string; title: string }> {
  const client = new Client({ auth: apiKey, retry: { maxRetries: 5 } });
  await throttleNotion();
  const database = await client.databases.create({
    parent: { type: 'workspace', workspace: true },
    title: [{ type: 'text', text: { content: 'Notemaker Terms' } }],
    initial_data_source: {
      properties: {
        Study: { title: {} },
        Category: { multi_select: {} },
        Priority: {
          select: {
            options: [
              { name: 'High', color: 'red' },
              { name: 'Medium', color: 'yellow' },
              { name: 'Low', color: 'blue' },
            ],
          },
        },
        'Daily Learning Done': { checkbox: {} },
        Date: { date: {} },
      },
    },
  });

  let dataSourceId = 'data_sources' in database ? database.data_sources[0]?.id : undefined;
  if (!dataSourceId) {
    await throttleNotion();
    const hydrated = await client.databases.retrieve({ database_id: database.id });
    dataSourceId = 'data_sources' in hydrated ? hydrated.data_sources[0]?.id : undefined;
  }

  if (!dataSourceId) {
    throw new Error('Failed to resolve Notion data source id for the new database.');
  }

  return {
    id: dataSourceId,
    title: ('title' in database ? database.title[0]?.plain_text : undefined) ?? 'Notemaker Terms',
  };
}
