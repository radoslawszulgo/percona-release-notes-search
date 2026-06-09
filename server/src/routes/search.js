import { Router } from 'express';
import { getCollection } from '../db.js';
import { generateEmbedding, isOllamaAvailable } from '../embeddings.js';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'llama3.2';

const router = Router();

// ── Vector search ────────────────────────────────────────────────────────────

async function vectorSearch(collection, query, product) {
  const queryVector = await generateEmbedding(query);

  const vectorStage = {
    $vectorSearch: {
      index: 'vector_index',
      path: 'embedding',
      queryVector,
      numCandidates: 150,
      limit: 20,
      ...(product ? { filter: { product } } : {}),
    },
  };

  return collection
    .aggregate([
      vectorStage,
      { $addFields: { score: { $meta: 'vectorSearchScore' } } },
      { $project: { content: 0, embedding: 0 } },
    ])
    .toArray();
}

// ── Text / Atlas Search ───────────────────────────────────────────────────────

async function textSearch(collection, query, product) {
  try {
    const pipeline = [
      {
        $search: {
          index: 'default',
          text: {
            query,
            path: ['content', 'releaseHighlights.title', 'releaseHighlights.content', 'newFeatures.description', 'improvements.description', 'bugFixes.description'],
            fuzzy: { maxEdits: 1 },
          },
        },
      },
      { $addFields: { score: { $meta: 'searchScore' } } },
      ...(product ? [{ $match: { product } }] : []),
      { $sort: { score: -1 } },
      { $limit: 20 },
      { $project: { content: 0, embedding: 0 } },
    ];
    return await collection.aggregate(pipeline).toArray();
  } catch (err) {
    if (err.codeName === 'IndexNotFound' || err.code === 40324 || /search index/i.test(err.message)) {
      const filter = product ? { product, $text: { $search: query } } : { $text: { $search: query } };
      return collection
        .find(filter, { projection: { content: 0, embedding: 0 }, sort: { score: { $meta: 'textScore' } }, limit: 20 })
        .toArray()
        .catch(async () => {
          const regex = new RegExp(query.split(/\s+/).join('|'), 'i');
          const textFilter = product ? { product, content: { $regex: regex } } : { content: { $regex: regex } };
          return collection.find(textFilter, { projection: { content: 0, embedding: 0 }, limit: 20 }).toArray();
        });
    }
    throw err;
  }
}

// ── AI Summary ────────────────────────────────────────────────────────────────

async function summarizeResults(query, results) {
  if (results.length === 0) return { summary: null, summaryError: null };

  const docs = results.slice(0, 10).map((r) => {
    const lines = [];
    if (r.releaseHighlights?.length) lines.push(`Highlights: ${r.releaseHighlights.map((h) => [h.title, h.content].filter(Boolean).join(': ')).join('; ')}`);
    if (r.newFeatures?.length) lines.push(`New features: ${r.newFeatures.map((f) => f.description).join('; ')}`);
    if (r.improvements?.length) lines.push(`Improvements: ${r.improvements.map((i) => i.description).join('; ')}`);
    if (r.bugFixes?.length) lines.push(`Bug fixes: ${r.bugFixes.map((b) => b.description).join('; ')}`);
    return `### ${r.product} v${r.version}\n${lines.join('\n')}`;
  });

  const prompt = `You are a technical assistant for Percona release notes. A user searched for: "${query}"\n\nHere are the most relevant release notes found:\n\n${docs.join('\n\n')}\n\nWrite a concise, conversational response (3-5 sentences) that directly answers what the user was looking for by highlighting the most relevant findings across these release notes. Focus on what matters most to their query. Do not list every result — synthesize the key insights.`;

  try {
    let res;
    try {
      res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CHAT_MODEL,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (fetchErr) {
      const reason = fetchErr?.name === 'TimeoutError'
        ? `Request to Ollama timed out after 30 s`
        : `Could not reach Ollama at ${OLLAMA_URL}: ${fetchErr?.message ?? fetchErr}`;
      return { summary: null, summaryError: reason };
    }

    if (!res.ok) {
      return { summary: null, summaryError: `Ollama returned HTTP ${res.status} ${res.statusText}` };
    }

    const data = await res.json();
    const content = data.message?.content ?? null;
    if (!content) {
      return { summary: null, summaryError: `Ollama responded but returned no content (model: ${CHAT_MODEL})` };
    }
    return { summary: content, summaryError: null };
  } catch (err) {
    return { summary: null, summaryError: `Unexpected error generating AI summary: ${err?.message ?? err}` };
  }
}

// ── Keyword extraction ────────────────────────────────────────────────────────

async function extractKeywords(query) {
  const prompt = `Extract keywords from this search query to highlight in release notes. Follow these rules:
1. Expand known abbreviations and acronyms to their full names (e.g. "AL2023" or "AL23" → "amazon linux 2023", "PSMDB" → "percona server for mongodb", "PXC" → "percona xtradb cluster", "PBM" → "percona backup for mongodb", "PMM" → "percona monitoring and management", "PS" → "percona server", "PG" → "postgresql", "k8s" → "kubernetes").
2. Include both the abbreviation and its expansion as separate entries.
3. Include version identifiers, product names, and meaningful technical terms.
4. Ignore generic question words like "what", "has", "in", "the", "changed", "is", "are".
5. Return ONLY a JSON array of lowercase strings, no explanation, no code fences.

Example: query "What changed in AL23?" → ["al23", "amazon linux 2023"]
Example: query "PSMDB bug fixes" → ["psmdb", "percona server for mongodb", "bug", "fix"]

Query: "${query}"`;

  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (fetchErr) {
    const reason = fetchErr?.name === 'TimeoutError'
      ? `Ollama did not respond within 15 s`
      : `Could not reach Ollama at ${OLLAMA_URL}: ${fetchErr?.message ?? fetchErr}`;
    return { keywords: null, keywordsError: reason };
  }

  if (!res.ok) {
    return { keywords: null, keywordsError: `Ollama returned HTTP ${res.status} ${res.statusText} (model: ${CHAT_MODEL})` };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { keywords: null, keywordsError: `Ollama response was not valid JSON` };
  }

  const content = data.message?.content ?? '';
  const match = content.match(/\[.*?\]/s);
  if (!match) {
    return { keywords: null, keywordsError: `Model did not return a JSON array — response: "${content.slice(0, 120)}"` };
  }

  try {
    const keywords = JSON.parse(match[0]);
    if (!Array.isArray(keywords) || keywords.length === 0) {
      const STOPWORDS = new Set(['what','has','have','is','are','in','on','at','the','a','an','of','to','for','and','or','with','from','that','this','be','been','was','were','changed','added','fixed','new','by','how','why','when','where','which','can','do','did','does']);
      const fallback = query.trim().toLowerCase().split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
      if (fallback.length) return { keywords: fallback, keywordsError: null };
      return { keywords: null, keywordsError: `Model returned an empty keyword list` };
    }
    return { keywords: keywords.map(k => String(k).toLowerCase()), keywordsError: null };
  } catch {
    return { keywords: null, keywordsError: `Could not parse keyword array from model response: "${match[0].slice(0, 80)}"` };
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { query, product, type = 'text' } = req.body ?? {};
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  const collection = getCollection();

  if (type === 'vector') {
    if (!(await isOllamaAvailable())) {
      return res.status(503).json({ error: 'Ollama is not reachable. Vector search is unavailable.' });
    }
    const results = await vectorSearch(collection, query, product);
    const [{ summary, summaryError }, { keywords, keywordsError }] = await Promise.all([
      summarizeResults(query, results),
      extractKeywords(query),
    ]);
    return res.json({ results, searchType: 'vector', summary, summaryError, keywords, keywordsError });
  }

  const [results, { keywords, keywordsError }] = await Promise.all([
    textSearch(collection, query, product),
    extractKeywords(query),
  ]);
  const { summary, summaryError } = await summarizeResults(query, results);
  res.json({ results, searchType: 'text', summary, summaryError, keywords, keywordsError });
});

export default router;
