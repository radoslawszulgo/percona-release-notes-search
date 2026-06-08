import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb } from './db.js';
import uploadRouter from './routes/upload.js';
import searchRouter from './routes/search.js';
import documentsRouter from './routes/documents.js';
import embeddingsRouter from './routes/embeddings.js';

const PORT = process.env.PORT ?? 3000;

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/upload', uploadRouter);
app.use('/api/search', searchRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/embeddings', embeddingsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

connectDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
