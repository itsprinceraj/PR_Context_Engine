import pinecone from "../config/pinecone.config.js";
import { embeddingService } from "../services/embeddings.service.js";
import type { SearchSimilarPRsInput, SearchResult, PRVectorMetadata } from "../types/index.js";
import { logger } from "../utils/logger.js";

export async function searchSimilarPRsTool(input: SearchSimilarPRsInput) {
  const { query, top_k = 5 } = input;
  
  try {
    logger.info(`Searching for PRs similar to: "${query}"`);
    
    const embedding = await embeddingService.generateEmbeddings(query);
    
    const index = pinecone.Index<PRVectorMetadata>("pr-context-engine");
    const queryResponse = await index.query({
      topK: top_k,
      vector: embedding,
      includeMetadata: true
    });
    
    const results: SearchResult = {
      query,
      total_results: queryResponse.matches?.length || 0,
      results: queryResponse.matches?.map((match: any) => ({
        id: match.id,
        title: match.metadata?.title || "Untitled PR",
        body_preview: match.metadata?.body?.substring(0, 200) || "No description available",
        similarity_score: match.score || 0,
        owner: match.metadata?.owner || "unknown",
        repo: match.metadata?.repo || "unknown",
        pr_number: match.metadata?.pr_number || 0
      })) || []
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
