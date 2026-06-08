import { MongoClient } from 'mongodb';

let client;
let db;

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');

  client = new MongoClient(uri);
  await client.connect();

  db = client.db(process.env.MONGODB_DB ?? 'release_notes');
  console.log(`Connected to MongoDB: ${uri}`);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not connected — call connectDb() first');
  return db;
}

export function getCollection() {
  return getDb().collection(process.env.MONGODB_COLLECTION ?? 'documents');
}
