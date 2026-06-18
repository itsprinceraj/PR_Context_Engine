import * as fs from "fs/promises";
import { embeddingService } from "../services/embeddings.service.js";
import { rerankMatches } from "../utils/reranker.js";
import { getPRContextIndex } from "../utils/vectorStore.js";

interface RetrievalEvalCase {
  name?: string;
  query: string;
  expected: {
    owner: string;
    repo: string;
    pr_number: number;
  };
}

interface RetrievalEvalReport {
  total_cases: number;
  hits_at_k: number;
  recall_at_k: number;
  k: number;
  results: Array<{
    name: string;
    hit: boolean;
    expected: RetrievalEvalCase["expected"];
    top_results: Array<{
      owner?: string;
      repo?: string;
      pr_number?: number;
      title?: string;
      rerank_score: number;
      vector_score: number;
      matched_terms: string[];
    }>;
  }>;
}

const evalFilePath = process.argv[2] ?? "examples/retrieval-eval.example.json";
const topK = Number(process.argv[3] ?? 5);

async function main(): Promise<void> {
  const evalCases = await loadEvalCases(evalFilePath);
  const index = getPRContextIndex();
  const results: RetrievalEvalReport["results"] = [];

  for (const evalCase of evalCases) {
    const embedding = await embeddingService.generateEmbeddings(evalCase.query);
    const queryResponse = await index.query({
      topK: Math.max(topK * 4, 20),
      vector: embedding,
      includeMetadata: true,
      filter: {
        is_guideline: { $ne: true },
        owner: { $eq: evalCase.expected.owner },
        repo: { $eq: evalCase.expected.repo }
      }
    });

    const rerankedMatches = rerankMatches(evalCase.query, queryResponse.matches, topK);
    const hit = rerankedMatches.some((match) => match.metadata?.pr_number === evalCase.expected.pr_number);

    results.push({
      name: evalCase.name ?? evalCase.query,
      hit,
      expected: evalCase.expected,
      top_results: rerankedMatches.map((match) => ({
        owner: match.metadata?.owner,
        repo: match.metadata?.repo,
        pr_number: match.metadata?.pr_number,
        title: match.metadata?.title,
        rerank_score: match.rerank_score,
        vector_score: match.vector_score,
        matched_terms: match.matched_terms
      }))
    });
  }

  const hitsAtK = results.filter((result) => result.hit).length;
  const report: RetrievalEvalReport = {
    total_cases: evalCases.length,
    hits_at_k: hitsAtK,
    recall_at_k: evalCases.length === 0 ? 0 : hitsAtK / evalCases.length,
    k: topK,
    results
  };

  console.log(JSON.stringify(report, null, 2));
}

async function loadEvalCases(filePath: string): Promise<RetrievalEvalCase[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as RetrievalEvalCase[];
  if (!Array.isArray(parsed)) {
    throw new Error("Retrieval eval file must be an array");
  }

  for (const evalCase of parsed) {
    if (!evalCase.query || !evalCase.expected?.owner || !evalCase.expected.repo || !Number.isInteger(evalCase.expected.pr_number)) {
      throw new Error("Each eval case must include query and expected owner/repo/pr_number");
    }
  }

  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
