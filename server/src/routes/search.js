import { Router } from 'express';
import { getCollection } from '../db.js';

const router = Router();

router.post('/', async (req, res) => {
  const { query, product } = req.body ?? {};
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  const collection = getCollection();

  // Try Search ($search) first — this is what mongot powers.
  // Falls back to $text search if the search index is not available.
  let results;
  try {
    const pipeline = [
      {
        $search: {
          index: 'default',
          text: {
            query,
            path: ['content', 'releaseHighlights', 'newFeatures.description', 'improvements.description', 'bugFixes.description'],
            fuzzy: { maxEdits: 1 },
          },
        },
      },
      { $addFields: { score: { $meta: 'searchScore' } } },
      ...(product ? [{ $match: { product } }] : []),
      { $sort: { score: -1 } },
      { $limit: 20 },
      { $project: { content: 0 } },
    ];
    results = await collection.aggregate(pipeline).toArray();
  } catch (err) {
    // mongot / Atlas Search not available — fall back to regex scan
    if (err.codeName === 'IndexNotFound' || err.code === 40324 || /search index/i.test(err.message)) {
      const filter = product
        ? { product, $text: { $search: query } }
        : { $text: { $search: query } };
      results = await collection
        .find(filter, { projection: { content: 0 }, sort: { score: { $meta: 'textScore' } }, limit: 20 })
        .toArray()
        .catch(async () => {
          // No text index either — regex fallback
          const regex = new RegExp(query.split(/\s+/).join('|'), 'i');
          const textFilter = product
            ? { product, content: { $regex: regex } }
            : { content: { $regex: regex } };
          return collection.find(textFilter, { projection: { content: 0 }, limit: 20 }).toArray();
        });
    } else {
      throw err;
    }
  }

  res.json({ results });
});

export default router;
