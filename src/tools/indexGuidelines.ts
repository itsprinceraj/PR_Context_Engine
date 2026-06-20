import octokit from "../config/github.config.js";
import { embeddingService } from "../services/embeddings.service.js";
import type { IndexGuidelinesInput, IndexResult } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { buildVectorId, getVectorStoreName, upsertVectorsInBatches, type VectorRecord } from "../utils/vectorStore.js";
import { withRetry } from "../utils/retry.js";

function isGitHubNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}

export async function indexGuidelinesTool(input: IndexGuidelinesInput) {
  const { owner, repo } = input;
  
  try {
    logger.info(`Indexing guidelines for ${owner}/${repo}`);
    
    const filesToFetch = input.paths ?? ["CONTRIBUTING.md", "README.md", "docs/architecture.md"];
    const vectorsToUpsert: VectorRecord[] = [];
    
    for (const filename of filesToFetch) {
      try {
        const { data: fileContent } = await withRetry(
          () => octokit.repos.getContent({ owner, repo, path: filename }),
          { operationName: `GitHub repos.getContent:${filename}` }
        );
        
        if (!("content" in fileContent)) continue;
        
        const content = Buffer.from(fileContent.content, "base64").toString("utf-8");
        
        // Chunking the content into paragraphs or 2000-char segments
        const chunks = content.match(/[\s\S]{1,2000}/g) || [];
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await embeddingService.generateEmbeddings(`File: ${filename}\n\n${chunk}`);
          
          vectorsToUpsert.push({
            id: buildVectorId(owner, repo, "guideline", filename, `chunk_${i}`),
            values: embedding,
            metadata: {
              owner,
              repo,
              filename,
              is_guideline: true,
              guideline_content: chunk.substring(0, 1000)
            }
          });
        }
      } catch (error: unknown) {
        if (isGitHubNotFoundError(error)) {
          logger.info(`File ${filename} not found in ${owner}/${repo}, skipping.`);
        } else {
          logger.error(`Error fetching ${filename}:`, error);
        }
      }
    }

    if (vectorsToUpsert.length > 0) {
      logger.info(`Upserting ${vectorsToUpsert.length} guideline vectors to ${getVectorStoreName()} vector store...`);
      await upsertVectorsInBatches(vectorsToUpsert);
    }
    
    const result: IndexResult = {
      success: true,
      message: vectorsToUpsert.length > 0
        ? `Successfully indexed ${vectorsToUpsert.length} guideline chunks for ${owner}/${repo}`
        : `No guideline files found to index for ${owner}/${repo}`,
      vector_id: buildVectorId(owner, repo, "guidelines"),
      metadata: {
        title: "Repository Guidelines",
        author: "System",
        files_changed: vectorsToUpsert.length
      }
    };
    
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    logger.error("Error in indexGuidelines:", error);
    
    const errorResult = {
      success: false,
      message: `Failed to index guidelines for ${owner}/${repo}`,
      error: error instanceof Error ? error.message : "Unknown error"
    };
    
    return {
      content: [{ type: "text" as const, text: JSON.stringify(errorResult, null, 2) }],
      isError: true
    };
  }
}
