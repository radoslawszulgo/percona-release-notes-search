#!/bin/bash
# One-shot init: creates the Search indexes the API expects
# (see server/src/routes/search.js — 'default' for $search, 'vector_index'
# for $vectorSearch). Idempotent; retries until mongot is ready.
set -e

MONGO_URI="mongodb://root:password@mongod.search-percona:27017/?authSource=admin"
MAX_ATTEMPTS=30

echo "==> Waiting for mongod..."
until mongosh "$MONGO_URI" --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Creating search indexes (retrying until mongot is ready)..."
attempt=0
until mongosh "$MONGO_URI" --quiet --eval "
  const rn = db.getSiblingDB('release_notes');

  // createSearchIndex requires the collection to exist
  if (!rn.getCollectionNames().includes('documents')) {
    rn.createCollection('documents');
  }

  const existing = rn.documents.aggregate([{ \$listSearchIndexes: {} }]).toArray().map(i => i.name);

  if (!existing.includes('default')) {
    rn.documents.createSearchIndex('default', { mappings: { dynamic: true } });
    print('Created search index: default');
  } else {
    print('Search index already exists: default');
  }

  if (!existing.includes('vector_index')) {
    rn.documents.createSearchIndex('vector_index', 'vectorSearch', {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: 768, similarity: 'cosine' },
        { type: 'filter', path: 'product' }
      ]
    });
    print('Created search index: vector_index');
  } else {
    print('Search index already exists: vector_index');
  }
"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "ERROR: could not create search indexes after $MAX_ATTEMPTS attempts — is mongot running?" >&2
    exit 1
  fi
  echo "    mongot not ready yet (attempt $attempt/$MAX_ATTEMPTS), retrying in 5s..."
  sleep 5
done

echo "==> Search indexes ready."
