/**
 * Parses a Percona release notes markdown file into a structured document.
 *
 * Filename convention: "<version>.md" (e.g. "7.0.18-11.md")
 * Product is inferred from the H1 heading.
 */

const PRODUCT_PATTERNS = [
  { pattern: /percona server for mongodb/i, product: 'Percona Server for MongoDB' },
  { pattern: /percona backup for mongodb/i, product: 'Percona Backup for MongoDB' },
  { pattern: /percona operator for mongodb/i, product: 'Percona Operator for MongoDB' },
  { pattern: /percona clustersync for mongodb/i, product: 'Percona ClusterSync for MongoDB' },
];

const SECTION_HEADINGS = {
  newFeatures: /^#{2,3}\s+(new features?)/i,
  improvements: /^#{2,3}\s+(improvements?)/i,
  bugFixes: /^#{2,3}\s+(fixed bugs?|bug fixes?)/i,
  releaseHighlights: /^#{2,3}\s+(release highlights?)/i,
  upstreamImprovements: /^#{2,3}\s+(upstream improvements?|upstream fixes?)/i,
};

function detectProduct(text) {
  for (const { pattern, product } of PRODUCT_PATTERNS) {
    if (pattern.test(text)) return product;
  }
  return 'Unknown Percona Product';
}

function extractVersion(text) {
  const match = text.match(/\b(\d+\.\d+[\.\d]*(?:-\d+)?)\b/);
  return match ? match[1] : null;
}

function parseTicketItems(lines) {
  const items = [];
  let current = null;

  for (const line of lines) {
    const ticketMatch = line.match(/\[([A-Z]+-\d+)\]\(https?:\/\/[^\)]+\)\s*[-–]?\s*(.*)/);
    if (ticketMatch) {
      if (current) items.push(current);
      current = { ticket: ticketMatch[1], description: ticketMatch[2].trim() };
    } else if (current && line.trim() && !line.startsWith('#')) {
      current.description += ' ' + line.trim();
    } else if (line.startsWith('#')) {
      if (current) items.push(current);
      current = null;
      break;
    }
  }
  if (current) items.push(current);
  return items;
}

function parseReleaseHighlights(lines) {
  const highlights = [];
  let currentTitle = null;
  let currentLines = [];

  const flush = () => {
    if (currentTitle !== null) {
      const text = currentLines
        .join('\n')
        .split(/\n\n+/)
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .join('\n\n');
      highlights.push({ title: currentTitle, content: text });
    }
  };

  for (const line of lines) {
    if (/^#{2}\s/.test(line)) break; // hit next H2 section
    if (/^#{3}\s+(.+)/.test(line)) {
      flush();
      currentTitle = line.replace(/^#{3}\s+/, '').trim();
      currentLines = [];
    } else if (currentTitle !== null) {
      currentLines.push(line);
    }
  }
  flush();

  // If no H3 subsections found, fall back to plain paragraphs
  if (!highlights.length) {
    const paragraphs = [];
    let current = [];
    for (const line of lines) {
      if (line.startsWith('#')) break;
      if (line.trim() === '') {
        if (current.length) { paragraphs.push(current.join(' ').trim()); current = []; }
      } else {
        current.push(line.trim());
      }
    }
    if (current.length) paragraphs.push(current.join(' ').trim());
    return paragraphs.filter(Boolean).map((p) => ({ title: null, content: p }));
  }

  return highlights;
}

export function parseReleaseNote(filename, markdownContent) {
  const lines = markdownContent.split('\n');

  const h1 = lines.find((l) => l.startsWith('# ')) ?? '';
  const product = detectProduct(h1 || markdownContent);

  const versionFromFilename = extractVersion(filename.replace('.md', ''));
  const versionFromH1 = extractVersion(h1);
  const version = versionFromFilename ?? versionFromH1 ?? 'unknown';

  const sections = {
    releaseHighlights: [],
    newFeatures: [],
    improvements: [],
    bugFixes: [],
    upstreamImprovements: [],
  };

  let currentSection = null;
  const sectionLines = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let matched = false;
    for (const [key, pattern] of Object.entries(SECTION_HEADINGS)) {
      if (pattern.test(line)) {
        currentSection = key;
        sectionLines[key] = [];
        matched = true;
        break;
      }
    }
    if (!matched && currentSection && !line.startsWith('# ')) {
      sectionLines[currentSection].push(line);
    } else if (!matched && line.startsWith('# ') && i > 0) {
      currentSection = null;
    }
  }

  for (const [key, linesArr] of Object.entries(sectionLines)) {
    if (key === 'releaseHighlights') {
      sections[key] = parseReleaseHighlights(linesArr);
    } else {
      sections[key] = parseTicketItems(linesArr);
    }
  }

  return {
    filename,
    product,
    version,
    content: markdownContent,
    ...sections,
    uploadedAt: new Date(),
  };
}
