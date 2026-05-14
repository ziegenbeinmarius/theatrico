import type { FlatLine } from './scriptUtils';

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(s: string): Map<string, number> {
  if (s.length < 3) return new Map();
  const m = new Map<string, number>();
  for (let i = 0; i <= s.length - 3; i++) {
    const tri = s.slice(i, i + 3);
    m.set(tri, (m.get(tri) ?? 0) + 1);
  }
  return m;
}

// Dice-coefficient trigram similarity — mirrors the backend matcher.go algorithm.
function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return wordOverlapScore(a, b);
  let intersection = 0;
  for (const [k, ca] of ta) {
    const cb = tb.get(k) ?? 0;
    if (cb > 0) intersection += Math.min(ca, cb);
  }
  return (2 * intersection) / (ta.size + tb.size);
}

function wordOverlapScore(a: string, b: string): number {
  const wordsA = a.split(' ').filter(Boolean);
  const wordsB = new Set(b.split(' ').filter(Boolean));
  if (wordsA.length === 0 || wordsB.size === 0) return 0;
  const overlap = wordsA.filter((w) => w && wordsB.has(w)).length;
  return overlap / Math.max(wordsA.length, wordsB.size);
}

function transcriptCandidates(normalized: string): string[] {
  if (!normalized) return [];
  const words = normalized.split(" ").filter(Boolean);
  const candidates = [normalized];

  const tailSizes = [12, 8, 6];
  for (const size of tailSizes) {
    if (words.length > size) {
      candidates.push(words.slice(words.length - size).join(" "));
    }
  }
  return candidates;
}

type LineCache = Array<{ norm: string; tgrams: Map<string, number> }>;

function buildCache(lines: FlatLine[]): LineCache {
  return lines.map((fl) => {
    const norm = normalizeText(fl.line.text);
    return { norm, tgrams: trigrams(norm) };
  });
}

// Module-level cache keyed by lines array reference to avoid recomputing on every call.
let cachedLines: FlatLine[] | null = null;
let cache: LineCache = [];

function getCache(lines: FlatLine[]): LineCache {
  if (lines !== cachedLines) {
    cachedLines = lines;
    cache = buildCache(lines);
  }
  return cache;
}

export function matchTranscriptToScript(
  transcript: string,
  lines: FlatLine[],
  currentIdx: number,
  windowSize = 15,
  threshold = 0.35,
): number {
  if (!transcript.trim() || lines.length === 0) return -1;
  const normTranscript = normalizeText(transcript);
  const candidates = transcriptCandidates(normTranscript);
  if (candidates.length === 0) return -1;
  const lineCache = getCache(lines);

  const start = Math.max(0, currentIdx);
  const end = Math.min(lines.length - 1, currentIdx + windowSize);
  let bestIdx = -1;
  let bestScore = threshold;

  for (let i = start; i <= end; i++) {
    const entry = lineCache[i];
    if (!entry) continue;

    let score = 0;
    for (const candidate of candidates) {
      const inputGrams = trigrams(candidate);
      const candidateScore =
        inputGrams.size > 0 && entry.tgrams.size > 0
          ? trigramSimilarity(candidate, entry.norm)
          : wordOverlapScore(candidate, entry.norm);
      if (candidateScore > score) {
        score = candidateScore;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function buildContextHint(lines: FlatLine[], currentIdx: number, windowSize = 8): string {
  if (lines.length === 0) return '';
  const start = Math.max(0, currentIdx);
  const end = Math.min(lines.length - 1, start + windowSize);
  return lines
    .slice(start, end + 1)
    .map((fl) => (fl.line.character ? `${fl.line.character}: ${fl.line.text}` : fl.line.text))
    .join('\n');
}
