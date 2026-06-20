import type { PRVectorMetadata, SimilarPRMatch } from "../types/index.js";

export interface RerankedMatch extends SimilarPRMatch {
  rerank_score: number;
  vector_score: number;
  lexical_score: number;
  matched_terms: string[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
]);

export function rerankMatches(query: string, matches: SimilarPRMatch[], limit: number): RerankedMatch[] {
  const queryTerms = tokenize(query);

  return matches
    .map((match) => {
      const searchableText = buildSearchableText(match.metadata);
      const documentTerms = tokenize(searchableText);
      const matchedTerms = queryTerms.filter((term) => documentTerms.includes(term));
      const lexicalScore = queryTerms.length === 0 ? 0 : matchedTerms.length / queryTerms.length;
      const vectorScore = clampScore(match.score ?? 0);
      const rerankScore = vectorScore * 0.78 + lexicalScore * 0.22;

      return {
        ...match,
        vector_score: vectorScore,
        lexical_score: lexicalScore,
        rerank_score: rerankScore,
        matched_terms: Array.from(new Set(matchedTerms))
      };
    })
    .sort((left, right) => right.rerank_score - left.rerank_score)
    .slice(0, limit);
}

export function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9_]+/g)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && !STOP_WORDS.has(term))
    )
  );
}

function buildSearchableText(metadata?: PRVectorMetadata): string {
  if (!metadata) return "";

  return [
    metadata.title,
    metadata.body,
    metadata.filename,
    metadata.patch,
    metadata.guideline_content,
    metadata.review_comment
  ]
    .filter(Boolean)
    .join("\n");
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}
