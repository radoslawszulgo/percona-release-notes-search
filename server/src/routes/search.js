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
  if (results.length === 0) return null;

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
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.message?.content ?? null;
  } catch {
    return null;
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
    const summary = await summarizeResults(query, results);
    return res.json({ results, searchType: 'vector', summary });
  }

  const results = await textSearch(collection, query, product);
  res.json({ results, searchType: 'text' });
});

export default router;
