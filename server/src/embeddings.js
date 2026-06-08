const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

export function buildEmbeddingText(doc) {
  const parts = [
    doc.product,
    doc.version,
    ...(doc.releaseHighlights ?? []).map((h) => [h.title, h.content].filter(Boolean).join(' ')),
    ...(doc.newFeatures ?? []).map((f) => f.description),
    ...(doc.improvements ?? []).map((f) => f.description),
    ...(doc.bugFixes ?? []).map((f) => f.description),
  ];
  return parts.filter(Boolean).join(' ');
}

export async function generateEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama embed failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  // Ollama returns { embeddings: [[...]] } for /api/embed
  return data.embeddings?.[0] ?? data.embedding;
}

export function isOllamaAvailable() {
  return fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    .then((r) => r.ok)
    .catch(() => false);
}
