import pinecone from "../config/pinecone.config.js";
import octokit from "../config/github.config.js";
import { embeddingService } from "../services/embeddings.service.js";
import type { IndexPRInput, IndexResult, PRVectorMetadata } from "../types/index.js";
import { logger } from "../utils/logger.js";

export async function indexPRTool(input: IndexPRInput) {
  const { owner, repo, pr_number } = input;
  
  try {
    logger.info(`Indexing PR #${pr_number} from ${owner}/${repo}`);
    
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pr_number
    });
    
    const contentToIndex = `Repository: ${owner}/${repo}\nPR #${pr_number}\nTitle: ${pr.title}\nDescription: ${pr.body || 'No description provided'}\nAuthor: ${pr.user?.login}\nStatus: ${pr.state}\nCreated: ${pr.created_at}\nChanges: ${pr.changed_files} files changed\nAdditions: +${pr.additions}\nDeletions: -${pr.deletions}\nComments: ${pr.comments}\nReview Comments: ${pr.review_comments}`;
    
    const embedding = await embeddingService.generateEmbeddings(contentToIndex);
    
    const vectorId = `${owner}/${repo}/${pr_number}`;
    const metadata: PRVectorMetadata = {
      owner,
      repo,
      pr_number,
      title: pr.title,
      body: pr.body?.substring(0, 1000) || "",
      author: pr.user?.login || "unknown",
      created_at: pr.created_at,
      url: pr.html_url,
      changed_files: pr.changed_files || 0,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0
    };
    
    const index = pinecone.Index<PRVectorMetadata>("pr-context-engine");
    await index.upsert([
      {
        id: vectorId,
        values: embedding,
        metadata
      }
    ]);
    
    const result: IndexResult = {
      success: true,
      message: `Successfully indexed PR #${pr_number}`,
      vector_id: vectorId,
      metadata: {
        title: pr.title,
        author: pr.user?.login || "unknown",
        files_changed: pr.changed_files || 0
      }
    };
    
    logger.info(`Successfully indexed ${vectorId}`);
    
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    logger.error("Error in indexPR:", error);
    
    const errorResult: IndexResult = {
      success: false,
      message: `Failed to index PR #${pr_number}`,
      vector_id: "",
      metadata: {
        title: "",
        author: "",
        files_changed: 0
      }
    };
    
    return {
      content: [{ type: "text" as const, text: JSON.stringify(errorResult, null, 2) }],
      isError: true
    };
  }
}
