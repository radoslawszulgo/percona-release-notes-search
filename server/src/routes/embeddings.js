import { Router } from 'express';
import { getCollection } from '../db.js';
import { buildEmbeddingText, generateEmbedding, isOllamaAvailable } from '../embeddings.js';

const router = Router();

// POST /api/embeddings/update
// Regenerates embeddings for all documents (or only those missing one when ?missing=true).
router.post('/update', async (req, res) => {
  const missingOnly = req.query.missing === 'true';

  const ollamaUp = await isOllamaAvailable();
  if (!ollamaUp) {
    return res.status(503).json({ error: 'Ollama is not reachable. Is it running?' });
  }

  const collection = getCollection();
  const filter = missingOnly ? { embedding: { $exists: false } } : {};
  const docs = await collection.find(filter, { projection: { content: 0 } }).toArray();

  if (docs.length === 0) {
    return res.json({ updated: 0, failed: 0, message: 'No documents to update.' });
  }

  let updated = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      const embedding = await generateEmbedding(buildEmbeddingText(doc));
      await collection.updateOne({ _id: doc._id }, { $set: { embedding } });
      updated++;
    } catch (e) {
      console.warn(`Failed to embed doc ${doc._id}: ${e.message}`);
      failed++;
    }
  }

  res.json({ updated, failed, total: docs.length });
});

// GET /api/embeddings/status
// Returns how many documents have embeddings vs. total.
router.get('/status', async (_req, res) => {
  const collection = getCollection();
  const [total, embedded] = await Promise.all([
    collection.countDocuments(),
    collection.countDocuments({ embedding: { $exists: true } }),
  ]);
  const ollamaUp = await isOllamaAvailable();
  res.json({ total, embedded, missing: total - embedded, ollamaAvailable: ollamaUp });
});

export default router;
