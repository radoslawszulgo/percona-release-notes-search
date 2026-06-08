import { Router } from 'express';
import { getCollection } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const collection = getCollection();
  const docs = await collection
    .find({}, { projection: { content: 0 }, sort: { product: 1, version: -1 } })
    .toArray();
  res.json({ documents: docs });
});

router.delete('/:id', async (req, res) => {
  const { ObjectId } = await import('mongodb');
  const collection = getCollection();
  const result = await collection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ deleted: result.deletedCount });
});

export default router;
