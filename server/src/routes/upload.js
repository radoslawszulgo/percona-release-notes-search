import { Router } from 'express';
import multer from 'multer';
import { getCollection } from '../db.js';
import { parseReleaseNote } from '../parser.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/', upload.array('files'), async (req, res) => {
  if (!req.files?.length) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const collection = getCollection();
  const results = [];

  for (const file of req.files) {
    if (!file.originalname.endsWith('.md')) {
      results.push({ filename: file.originalname, error: 'Only .md files are supported' });
      continue;
    }

    const content = file.buffer.toString('utf-8');
    const doc = parseReleaseNote(file.originalname, content);

    await collection.replaceOne(
      { filename: doc.filename, product: doc.product },
      doc,
      { upsert: true },
    );

    results.push({ filename: file.originalname, product: doc.product, version: doc.version, status: 'ok' });
  }

  res.json({ results });
});

export default router;
