import octokit from "../config/github.config.js";
import { embeddingService } from "../services/embeddings.service.js";
import type { IndexPRInput, IndexResult } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { buildVectorId, upsertVectorsInBatches, type VectorRecord } from "../utils/vectorStore.js";

const MAX_FILES_TO_INDEX = 100;
const MAX_REVIEW_COMMENTS_TO_INDEX = 100;

export async function indexPRTool(input: IndexPRInput) {
  const { owner, repo, pr_number } = input;
  
  try {
    logger.info(`Indexing PR #${pr_number} from ${owner}/${repo} including deep file diffs and review comments`);
    
    // Fetch PR metadata
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pr_number
    });
    
    // Fetch PR files diffs
    const files = await octokit.paginate(octokit.pulls.listFiles, {
      owner,
      repo,
      pull_number: pr_number,
      per_page: 100
    });
    
    // Fetch review comments
    const comments = await octokit.paginate(octokit.pulls.listReviewComments, {
      owner,
      repo,
      pull_number: pr_number,
      per_page: 100
    });
    
    const vectorsToUpsert: VectorRecord[] = [];
    
    // 1. Embed and prepare the General PR Metadata Vector
    const contentToIndex = `Repository: ${owner}/${repo}\nPR #${pr_number}\nTitle: ${pr.title}\nDescription: ${pr.body || 'No description provided'}\nAuthor: ${pr.user?.login}\nStatus: ${pr.state}\nCreated: ${pr.created_at}\nChanges: ${pr.changed_files} files changed\nAdditions: +${pr.additions}\nDeletions: -${pr.deletions}\nComments: ${pr.comments}\nReview Comments: ${pr.review_comments}`;
    const prEmbedding = await embeddingService.generateEmbeddings(contentToIndex);
    
    vectorsToUpsert.push({
      id: buildVectorId(owner, repo, pr_number, "metadata"),
      values: prEmbedding,
      metadata: {
        owner,
        repo,
        pr_number,
        title: pr.title,
        body: pr.body?.substring(0, 500) || "",
        author: pr.user?.login || "unknown",
        created_at: pr.created_at,
        url: pr.html_url,
        changed_files: pr.changed_files || 0,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0
      }
    });

    // 2. Embed and prepare File-level Patch Vectors
    for (const file of files.slice(0, MAX_FILES_TO_INDEX)) {
      if (!file.patch) continue; // Skip binaries and files without diff text

      const fileContext = `File: ${file.filename}\nStatus: ${file.status}\nChanges in PR #${pr_number}:\n${file.patch}`;
      
      try {
        const fileEmbedding = await embeddingService.generateEmbeddings(fileContext);
        vectorsToUpsert.push({
          id: buildVectorId(owner, repo, pr_number, "file", file.filename),
          values: fileEmbedding,
          metadata: {
            owner,
            repo,
            pr_number,
            title: pr.title,
            body: pr.body?.substring(0, 500) || "",
            author: pr.user?.login || "unknown",
            created_at: pr.created_at,
            url: pr.html_url,
            changed_files: pr.changed_files || 0,
            additions: pr.additions || 0,
            deletions: pr.deletions || 0,
            filename: file.filename,
            patch: file.patch.substring(0, 1000) // Keep metadata payload reasonable
          }
        });
      } catch (err) {
        logger.error(`Failed to generate embedding for file ${file.filename}:`, err);
      }
    }
    
    // 3. Embed review comments
    for (const comment of comments.slice(0, MAX_REVIEW_COMMENTS_TO_INDEX)) {
      if (!comment.body) continue;
      
      const commentContext = `Review Comment on PR #${pr_number} by ${comment.user?.login}:\nFile: ${comment.path}\nCode diff:\n${comment.diff_hunk}\nComment:\n${comment.body}`;
      
      try {
        const commentEmbedding = await embeddingService.generateEmbeddings(commentContext);
        vectorsToUpsert.push({
          id: buildVectorId(owner, repo, pr_number, "comment", comment.id),
          values: commentEmbedding,
          metadata: {
            owner,
            repo,
            pr_number,
            title: pr.title,
            author: comment.user?.login || "unknown",
            created_at: comment.created_at,
            filename: comment.path,
            is_review_comment: true,
            review_comment: comment.body.substring(0, 1000)
          }
        });
      } catch (err) {
        logger.error(`Failed to generate embedding for comment ${comment.id}:`, err);
      }
    }

    // Upsert everything in a single batch
    if (vectorsToUpsert.length > 0) {
      logger.info(`Upserting ${vectorsToUpsert.length} vectors for PR #${pr_number} to Pinecone...`);
      await upsertVectorsInBatches(vectorsToUpsert);
    }
    
    const result: IndexResult = {
      success: true,
      message: `Successfully indexed PR #${pr_number} with ${vectorsToUpsert.length} total vectors. Indexed ${Math.min(files.length, MAX_FILES_TO_INDEX)} of ${files.length} files and ${Math.min(comments.length, MAX_REVIEW_COMMENTS_TO_INDEX)} of ${comments.length} review comments.`,
      vector_id: buildVectorId(owner, repo, pr_number, "metadata"),
      metadata: {
        title: pr.title,
        author: pr.user?.login || "unknown",
        files_changed: pr.changed_files || 0
      }
    };
    
    logger.info(`Successfully completed indexing PR #${pr_number}`);
    
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    logger.error("Error in indexPR:", error);
    
    const errorResult: IndexResult = {
      success: false,
      message: `Failed to index PR #${pr_number}: ${error instanceof Error ? error.message : "Unknown error"}`,
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
