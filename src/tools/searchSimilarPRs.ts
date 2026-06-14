import { embeddingService } from "../services/embeddings.service.js";
import type { SearchSimilarPRsInput, SearchResult, SimilarPRMatch } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { getPRContextIndex } from "../utils/vectorStore.js";

export async function searchSimilarPRsTool(input: SearchSimilarPRsInput) {
  const { query, top_k = 5 } = input;
  
  try {
    logger.info(`Searching for PRs similar to: "${query}"`);
    
    const embedding = await embeddingService.generateEmbeddings(query);
    
    const index = getPRContextIndex();
    const queryResponse = await index.query({
      topK: Math.min(top_k * 3, 50),
      vector: embedding,
      includeMetadata: true,
      filter: {
        is_guideline: { $ne: true }
      }
    });

    const uniquePRs = new Map<string, SimilarPRMatch>();
    for (const match of (queryResponse.matches || []) as SimilarPRMatch[]) {
      const metadata = match.metadata;
      if (!metadata?.owner || !metadata.repo || typeof metadata.pr_number !== "number") continue;
      if (metadata.is_guideline) continue;

      const key = `${metadata.owner}/${metadata.repo}/${metadata.pr_number}`;
      if (!uniquePRs.has(key)) {
        uniquePRs.set(key, match);
      }

      if (uniquePRs.size >= top_k) break;
    }

    const matches = Array.from(uniquePRs.values());
    
    const results: SearchResult = {
      query,
      total_results: matches.length,
      results: matches.map((match) => ({
        id: match.id,
        title: match.metadata?.title || "Untitled PR",
        body_preview: match.metadata?.body?.substring(0, 200) || "No description available",
        similarity_score: match.score || 0,
        owner: match.metadata?.owner || "unknown",
        repo: match.metadata?.repo || "unknown",
        pr_number: match.metadata?.pr_number || 0
      }))
    };
    
    return {
      content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }]
    };
  } catch (error) {
    logger.error("Error in searchSimilarPRs:", error);
    
    return {
      content: [{ type: "text" as const, text: `Error searching similar PRs: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true
    };
  }
}
