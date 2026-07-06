import OpenAI from 'openai';

export type TermExplanation = {
  name: string;
  content: string;
  categories: string[];
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type Citation = { url: string; title: string; snippet: string };

// Keep only the most relevant sources per response: cited-in-answer annotations
// rank ahead of consulted-only search sources (insertion order below reflects this).
const MAX_CITATIONS_PER_RESPONSE = 5;

// TEMP DEBUG (remove after diagnosis): reveals whether a web search actually ran
// and what annotations the model attached.
function logWebSearchDebug(label: string, response: OpenAI.Responses.Response) {
  const itemTypes = response.output.map((i) => i.type);
  const annTypes: string[] = [];
  const searchSources: string[] = [];
  for (const item of response.output) {
    if (item.type === 'message') {
      for (const part of item.content) {
        if (part.type !== 'output_text') continue;
        for (const ann of part.annotations) annTypes.push(ann.type);
      }
    } else if (item.type === 'web_search_call') {
      const action = item.action;
      if (action.type === 'search' && action.sources) {
        for (const s of action.sources) searchSources.push(s.url);
      } else if (action.type === 'open_page' && action.url) {
        searchSources.push(action.url);
      }
    }
  }
  console.log(`[web-search-debug ${label}] outputItems=${JSON.stringify(itemTypes)} annotations=${JSON.stringify(annTypes)} searchSources=${JSON.stringify(searchSources)}`);
}

function extractCitations(response: OpenAI.Responses.Response): Citation[] {
  const byUrl = new Map<string, Citation>();
  // Prefer rich url_citation annotations (title + snippet) from prose answers.
  for (const item of response.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type !== 'output_text') continue;
      for (const ann of part.annotations) {
        if (ann.type !== 'url_citation') continue;
        if (byUrl.has(ann.url)) continue;
        const snippet = part.text.slice(ann.start_index, ann.end_index).trim();
        byUrl.set(ann.url, { url: ann.url, title: ann.title, snippet });
      }
    }
  }
  // Fallback for structured-output responses, which carry no annotations: use the
  // grounded source URLs the web_search tool actually used. Requires
  // include: ['web_search_call.action.sources'] on the request.
  for (const item of response.output) {
    if (item.type !== 'web_search_call') continue;
    const { action } = item;
    if (action.type === 'search' && action.sources) {
      for (const source of action.sources) {
        if (!byUrl.has(source.url)) byUrl.set(source.url, { url: source.url, title: '', snippet: '' });
      }
    } else if (action.type === 'open_page' && action.url) {
      if (!byUrl.has(action.url)) byUrl.set(action.url, { url: action.url, title: '', snippet: '' });
    }
  }
  return [...byUrl.values()].slice(0, MAX_CITATIONS_PER_RESPONSE);
}

function buildSystemPrompt(categories: string[]): string {
  return `You are a technical learning assistant. When given a technical term or concept, respond with a JSON object with exactly these fields:
- "name": the properly cased term name as it is conventionally written (string, e.g. "DKIM", "TCP/IP", "GraphQL", "OAuth 2.0")
- "content": a clear, concise explanation suitable for a technical notes database (string, 2-4 sentences)
- "categories": an array of categories chosen ONLY from this exact list (use the exact casing shown): ${categories.join(', ')}. Use "Uncategorized" ONLY if none of the other categories apply — never combine it with other categories.

Use web search to verify facts and to capture concepts that may be newer than your training knowledge whenever you are uncertain.

Respond ONLY with valid JSON, no markdown or extra text.`;
}

export type PreRefinementEvaluation = {
  accuracy: number;
  review: string;
};

export type RefinementEvaluation = {
  accuracy: number;
  review: string;
  formattedNote: string;
  additionalNote: string;
};

const PRE_REFINEMENT_PROMPT = `You are a technical learning evaluator using the Feynman technique.
The user has attempted to explain a concept from memory, before doing any research.
Evaluate their explanation and respond with a JSON object with these exact fields:
- "accuracy": integer 0-100 representing how accurate their explanation is
- "review": string describing what they got right and what was incorrect or missing. Be specific and constructive.

Respond ONLY with valid JSON, no markdown or extra text.`;

function buildRefinementPrompt(conceptName: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `You are a technical learning evaluator using the Feynman technique.
The user has researched the concept "${conceptName}" and is now explaining it with that knowledge.
Evaluate their explanation and respond with a JSON object with these exact fields:
- "accuracy": integer 0-100 representing accuracy of the explanation
- "review": string summarizing accuracy, what was correct, and any improvements
- "formattedNote": a short, complete plain-text explanation of "${conceptName}" — no markdown, no bold, no bullets. Ideal target: 1 paragraph, 3 sentences. Hard cap: 2 paragraphs, 6 sentences — only reach the cap when an important detail would otherwise be lost; default to the shorter target. Write naturally and concisely. Do not pad with framing phrases like "It matters because", "It works by", "This is important because" — just state the substance directly. The core concept is strictly "${conceptName}" itself, not the broader domain. Every sentence must directly describe what this concept is, how it specifically works, or why it specifically matters. Move any context about broader systems or related concepts to additionalNote's Suggested Studies instead.
- "additionalNote": digital reference notes in markdown format. Use **bold text** for section subheadings and prefix each bullet with "- ". Include a "**Date**: ${today}" line. Must include a "**Suggested Studies**" section listing related concepts worth exploring separately (e.g. similar technologies, complementary concepts, common points of confusion). Every point in this note must directly support understanding the main concept.

Respond ONLY with valid JSON, no markdown or extra text.`;
}

export async function evaluatePreRefinement(
  termName: string,
  userExplanation: string,
): Promise<PreRefinementEvaluation> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: PRE_REFINEMENT_PROMPT },
      { role: 'user', content: `Concept: ${termName}\n\nUser explanation: ${userExplanation}` },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<PreRefinementEvaluation>;
  if (typeof parsed.accuracy !== 'number' || typeof parsed.review !== 'string') {
    throw new Error('Invalid response shape from OpenAI');
  }

  return {
    accuracy: Math.min(100, Math.max(0, Math.round(parsed.accuracy))),
    review: parsed.review,
  };
}

export async function evaluateRefinement(
  termName: string,
  userExplanation: string,
): Promise<RefinementEvaluation> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: buildRefinementPrompt(termName) },
      { role: 'user', content: `Concept: ${termName}\n\nUser explanation: ${userExplanation}` },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<RefinementEvaluation> & Record<string, unknown>;
  const formattedNote =
    typeof parsed.formattedNote === 'string'
      ? parsed.formattedNote
      : typeof parsed.formatted_note === 'string'
        ? parsed.formatted_note
        : undefined;
  const additionalNote =
    typeof parsed.additionalNote === 'string'
      ? parsed.additionalNote
      : typeof parsed.additional_note === 'string'
        ? parsed.additional_note
        : undefined;

  if (
    typeof parsed.accuracy !== 'number' ||
    typeof parsed.review !== 'string' ||
    typeof formattedNote !== 'string' ||
    typeof additionalNote !== 'string'
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }

  return {
    accuracy: Math.min(100, Math.max(0, Math.round(parsed.accuracy))),
    review: parsed.review,
    formattedNote,
    additionalNote,
  };
}

const CHAT_SYSTEM_PROMPT = (termName: string, termContent: string) =>
  `You are a research assistant helping the user understand the concept "${termName}".
Context: ${termContent}
Answer only questions directly related to this concept. Be concise: respond in plain prose, no markdown, no bullet points. Maximum 2 short paragraphs.
Use web search to answer accurately when you are uncertain or when the information may be newer than your training knowledge.`;

export async function chatAboutTerm(
  termName: string,
  termContent: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
  forceWeb = false,
): Promise<{ answer: string; citations: Citation[] }> {
  const response = await client.responses.create({
    model: 'gpt-5.4-mini',
    tools: [{ type: 'web_search' }],
    tool_choice: forceWeb ? 'required' : 'auto',
    include: ['web_search_call.action.sources'],
    input: [
      { role: 'system', content: CHAT_SYSTEM_PROMPT(termName, termContent) },
      ...history,
      { role: 'user', content: question },
    ],
  });

  logWebSearchDebug(`chat forceWeb=${forceWeb}`, response);
  const answer = response.output_text;
  if (!answer) throw new Error('Empty response from OpenAI');
  return { answer, citations: extractCitations(response) };
}

export async function explainTermWithAI(term: string, allowedCategories: string[], context?: string, forceWeb = false): Promise<TermExplanation & { citations: Citation[] }> {
  const userContent = context ? `Term: ${term}\nContext: ${context}` : term;
  const response = await client.responses.create({
    model: 'gpt-5.4-mini',
    tools: [{ type: 'web_search' }],
    tool_choice: forceWeb ? 'required' : 'auto',
    include: ['web_search_call.action.sources'],
    input: [
      { role: 'system', content: buildSystemPrompt(allowedCategories) },
      { role: 'user', content: userContent },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'term_explanation',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            content: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'content', 'categories'],
        },
      },
    },
  });

  logWebSearchDebug(`explain forceWeb=${forceWeb}`, response);
  const raw = response.output_text;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<TermExplanation>;

  if (
    typeof parsed.name !== 'string' ||
    typeof parsed.content !== 'string' ||
    !Array.isArray(parsed.categories) ||
    !parsed.categories.every((c) => typeof c === 'string')
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }

  const categories = (parsed.categories as string[]).filter((c) => allowedCategories.includes(c));
  const specificCategories = categories.filter((c) => c !== 'Uncategorized');

  return {
    name: parsed.name,
    content: parsed.content,
    categories: specificCategories.length > 0 ? specificCategories : ['Uncategorized'],
    citations: extractCitations(response),
  };
}

export type VocabularyAnalysis = {
  definition: string;
  context_sentences: { sentence: string; setting: string }[];
  connections: string;
  morphology: string;
};

function buildVocabularyPrompt(type: 'word' | 'idiom'): string {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary learning assistant. Given a ${typeLabel}, respond with a JSON object with exactly these fields:

- "definition": What the ${typeLabel} means AND what it does NOT mean (common misconceptions). 2-3 sentences.
- "context_sentences": An array of exactly 5 objects, each with a "sentence" and a "setting" field. Each "sentence" must sound like something a real person would actually say in everyday conversation, with the ${typeLabel} itself replaced by the literal marker __blank__ (exactly once per sentence). Each "setting" is a short 2-4 word label describing where the sentence happens, and the 5 settings must be clearly different from each other (for example: "at work", "texting a friend", "family dinner", "formal email", "casual chat with a stranger"). Order the array with the single best, most natural sentence first — that one becomes the flashcard's main example sentence.
- "connections": Connect the ${typeLabel} to a well-known person, event, character, or cultural reference to aid memory. For example, "Alfred the butler in Batman is a factotum — he does everything for Bruce Wayne." 1-2 sentences.
- "morphology": The structural analysis — Latin or Greek roots, prefixes, suffixes, morphemes, etymology. Explain how the parts build the meaning. 1-3 sentences.

Respond ONLY with valid JSON, no markdown or extra text.`;
}

export async function analyzeVocabulary(
  word: string,
  type: 'word' | 'idiom',
): Promise<VocabularyAnalysis> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: buildVocabularyPrompt(type) },
      { role: 'user', content: word },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<VocabularyAnalysis>;
  const sentences = parsed.context_sentences;
  const validSentences =
    Array.isArray(sentences) &&
    sentences.length === 5 &&
    sentences.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as { sentence?: unknown }).sentence === 'string' &&
        typeof (s as { setting?: unknown }).setting === 'string' &&
        (s as { sentence: string }).sentence.split('__blank__').length === 2,
    );

  if (
    typeof parsed.definition !== 'string' ||
    !validSentences ||
    typeof parsed.connections !== 'string' ||
    typeof parsed.morphology !== 'string'
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }

  return parsed as VocabularyAnalysis;
}

const VOCABULARY_CHAT_SYSTEM_PROMPT = (word: string, type: 'word' | 'idiom', definition: string) => {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary tutor helping the user understand the ${typeLabel} "${word}".
Definition: ${definition}
Answer only questions about this ${typeLabel}'s meaning, usage, origin, or related words. Be concise: respond in plain prose, no markdown, no bullet points. Maximum 2 short paragraphs.`;
};

export async function chatAboutVocabulary(
  word: string,
  type: 'word' | 'idiom',
  definition: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: VOCABULARY_CHAT_SYSTEM_PROMPT(word, type, definition) },
      ...history,
      { role: 'user', content: question },
    ],
  });

  const answer = response.choices[0]?.message?.content;
  if (!answer) throw new Error('Empty response from OpenAI');
  return answer;
}

function buildSentenceEvaluationPrompt(type: 'word' | 'idiom'): string {
  const typeLabel = type === 'word' ? 'word' : 'idiom/phrase';
  return `You are a vocabulary tutor. Given a ${typeLabel}, its definition, and a sentence a learner wrote attempting to use it, judge whether the ${typeLabel} is used correctly and naturally. Respond with a JSON object with exactly these fields:

- "is_correct": true if the ${typeLabel} is used correctly and naturally in the sentence, false otherwise.
- "feedback": 1-2 sentences. If correct, briefly say why it works. If incorrect or awkward, briefly explain why and give a corrected example sentence.

Respond ONLY with valid JSON, no markdown or extra text.`;
}

export async function evaluateVocabularySentence(
  word: string,
  type: 'word' | 'idiom',
  definition: string,
  sentence: string,
): Promise<{ isCorrect: boolean; feedback: string }> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: buildSentenceEvaluationPrompt(type) },
      {
        role: 'user',
        content: `${type === 'word' ? 'Word' : 'Idiom'}: ${word}\nDefinition: ${definition}\nSentence: ${sentence}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');

  const parsed = JSON.parse(raw) as Partial<{ is_correct: unknown; feedback: unknown }>;
  if (typeof parsed.is_correct !== 'boolean' || typeof parsed.feedback !== 'string') {
    throw new Error('Invalid response shape from OpenAI');
  }

  return { isCorrect: parsed.is_correct, feedback: parsed.feedback };
}

export async function buildImagePrompt(
  word: string,
  context: string,
  definition: string,
): Promise<string> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      {
        role: 'system',
        content:
          'You write prompts for an AI image generator. Given a vocabulary word, its definition, and an example sentence, write a single vivid, concrete image-generation prompt that depicts the scene of the example sentence and reinforces the word\'s meaning. Describe subject, composition, setting, mood, and lighting. Do NOT include any text, letters, words, captions, or writing in the image. Respond with the prompt text only — no quotes, no preamble.',
      },
      {
        role: 'user',
        content: `Word: ${word}\nDefinition: ${definition}\nExample sentence: ${context}`,
      },
    ],
  });
  const prompt = response.choices[0]?.message?.content?.trim();
  if (!prompt) throw new Error('Empty image prompt from OpenAI');
  return prompt;
}

export async function generateVocabularyImage(
  prompt: string,
  model: string,
): Promise<Buffer> {
  const response = await client.images.generate({
    model,
    prompt,
    size: '1024x1024',
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image returned from OpenAI');
  return Buffer.from(b64, 'base64');
}

const VIDEO_MODEL = 'gpt-5.4-mini';

export async function summarizeVideo(transcript: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: VIDEO_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You summarize technical video transcripts for learning. Write a concise TLDR (2-4 sentences, plain prose, no markdown) capturing the core idea. Respond with the summary text only.',
      },
      { role: 'user', content: transcript },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return content.trim();
}

export async function extractVideoKeyTakeaways(transcript: string): Promise<string[]> {
  const response = await client.chat.completions.create({
    model: VIDEO_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You extract key takeaways from a technical video transcript. Respond ONLY with a JSON object of the form {"takeaways": string[]}. Each takeaway is one concise sentence. 3-7 items, most important first. No markdown.',
      },
      { role: 'user', content: transcript },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');
  const parsed = JSON.parse(raw) as { takeaways?: unknown };
  if (!Array.isArray(parsed.takeaways) || !parsed.takeaways.every((t) => typeof t === 'string')) {
    throw new Error('Invalid response shape from OpenAI');
  }
  return parsed.takeaways as string[];
}

export async function extractVideoKeyConcepts(
  transcript: string,
): Promise<{ concept: string; definition: string }[]> {
  const response = await client.chat.completions.create({
    model: VIDEO_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You mine key concepts from a technical video transcript that are worth researching individually. Respond ONLY with a JSON object of the form {"concepts": {"concept": string, "definition": string}[]}. Definition is concise and from your own knowledge. Sort by importance to the video, most important first. No markdown.',
      },
      { role: 'user', content: transcript },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from OpenAI');
  const parsed = JSON.parse(raw) as { concepts?: unknown };
  if (
    !Array.isArray(parsed.concepts) ||
    !parsed.concepts.every(
      (c) =>
        c && typeof c === 'object' &&
        typeof (c as Record<string, unknown>).concept === 'string' &&
        typeof (c as Record<string, unknown>).definition === 'string',
    )
  ) {
    throw new Error('Invalid response shape from OpenAI');
  }
  return parsed.concepts as { concept: string; definition: string }[];
}

// Split on whitespace into chunks of ~12k characters at word boundaries so a long
// transcript does not exceed the model's output-token limit when reformatting.
function chunkText(text: string, maxChars = 12000): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current} ${word}` : word;
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function formatVideoTranscript(rawTranscript: string): Promise<string> {
  const chunks = chunkText(rawTranscript);
  const formatted: string[] = [];
  for (const chunk of chunks) {
    const response = await client.chat.completions.create({
      model: VIDEO_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You clean up a raw video transcript chunk. Keep the same spoken words in the same order. Fix mis-transcribed technical terms, add proper punctuation and capitalization, and break into natural paragraphs. Do NOT summarize, add headings, or rewrite into an article — it must stay a transcript. Respond with the corrected transcript text only.',
        },
        { role: 'user', content: chunk },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');
    formatted.push(content.trim());
  }
  return formatted.join('\n\n');
}
