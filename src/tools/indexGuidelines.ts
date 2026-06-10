import pinecone from "../config/pinecone.config.js";
import octokit from "../config/github.config.js";
import { embeddingService } from "../services/embeddings.service.js";
import type { IndexGuidelinesInput, IndexResult, PRVectorMetadata } from "../types/index.js";
import { logger } from "../utils/logger.js";

export async function indexGuidelinesTool(input: IndexGuidelinesInput) {
  const { owner, repo } = input;
  
  try {
    logger.info(`Indexing guidelines for ${owner}/${repo}`);
    
    const filesToFetch = ["CONTRIBUTING.md", "README.md", "docs/architecture.md"];
    const index = pinecone.Index<PRVectorMetadata>("pr-context-engine");
    const vectorsToUpsert = [];
    
    for (const filename of filesToFetch) {
      try {
        const { data: fileContent } = await octokit.repos.getContent({
          owner,
          repo,
          path: filename
        });
        
        if (!("content" in fileContent)) continue;
        
        const content = Buffer.from(fileContent.content, "base64").toString("utf-8");
        
        // Chunking the content into paragraphs or 2000-char segments
        const chunks = content.match(/[\s\S]{1,2000}/g) || [];
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await embeddingService.generateEmbeddings(`File: ${filename}\n\n${chunk}`);
          
          vectorsToUpsert.push({
            id: `${owner}/${repo}/guideline/${filename}/chunk_${i}`,
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
      } catch (error: any) {
        if (error.status === 404) {
          logger.info(`File ${filename} not found in ${owner}/${repo}, skipping.`);
        } else {
          logger.error(`Error fetching ${filename}:`, error);
        }
      }
    }

    if (vectorsToUpsert.length > 0) {
      logger.info(`Upserting ${vectorsToUpsert.length} guideline vectors to Pinecone...`);
      await index.upsert(vectorsToUpsert);
    }
    
    const result: IndexResult = {
      success: true,
      message: `Successfully indexed ${vectorsToUpsert.length} guideline chunks for ${owner}/${repo}`,
      vector_id: `${owner}/${repo}/guidelines`,
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
