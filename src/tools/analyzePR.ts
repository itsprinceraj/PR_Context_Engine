import octokit from "../config/github.config.js";
import { embeddingService } from "../services/embeddings.service.js";
import type { AnalyzePRInput, PRAnalysis, SimilarPRMatch, PRVectorMetadata } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { getPRContextIndex } from "../utils/vectorStore.js";
import { withRetry } from "../utils/retry.js";

const MAX_DIFF_SNIPPETS = 50;
const MAX_PATCH_CHARS = 2000;

export async function analyzePRTool(input: AnalyzePRInput) {
  const { owner, repo, pr_number } = input;
  
  try {
    logger.info(`Analyzing PR #${pr_number} in ${owner}/${repo}`);
    
    // Fetch basic PR metadata
    const { data: currentPR } = await withRetry(
      () => octokit.pulls.get({ owner, repo, pull_number: pr_number }),
      { operationName: "GitHub pulls.get" }
    );

    // Fetch PR file diffs to pass back to the LLM Client for Deep Context Review
    const files = await withRetry(
      () => octokit.paginate(octokit.pulls.listFiles, { owner, repo, pull_number: pr_number, per_page: 100 }),
      { operationName: "GitHub pulls.listFiles" }
    );

    const diffSnippets = files
      .filter(f => f.patch)
      .slice(0, MAX_DIFF_SNIPPETS)
      .map(f => ({
        filename: f.filename,
        status: f.status,
        patch: f.patch?.substring(0, MAX_PATCH_CHARS) || ""
      }));
    
    // Use the basic metadata to find similar past PRs (General search)
    const prContext = `Title: ${currentPR.title}\nDescription: ${currentPR.body || 'No description provided'}\nAuthor: ${currentPR.user?.login}\nChanges: ${currentPR.changed_files} files, ${currentPR.additions} additions, ${currentPR.deletions} deletions`;
    
    const embedding = await embeddingService.generateEmbeddings(prContext);
    
    const index = getPRContextIndex();
    
    // Query specifically for repository guidelines
    let guidelines: SimilarPRMatch[] = [];
    try {
      const guidelineResponse = await index.query({
        topK: 3,
        vector: embedding,
        includeMetadata: true,
        filter: {
          is_guideline: { $eq: true },
          owner: { $eq: owner },
          repo: { $eq: repo }
        }
      });
      guidelines = (guidelineResponse.matches || []) as SimilarPRMatch[];
    } catch (e) {
      logger.warn("Could not fetch guidelines (maybe none indexed yet)", e);
    }
    
    // Query for similar PRs and file chunks
    const queryResponse = await index.query({
      topK: 15,
      vector: embedding,
      includeMetadata: true,
      filter: {
        is_guideline: { $ne: true },
        owner: { $eq: owner },
        repo: { $eq: repo }
      }
    });
    
    // Filter out guidelines and deduplicate PRs
    const prMatches = ((queryResponse.matches || []) as SimilarPRMatch[])
      .filter((m) => !m.metadata?.is_guideline && typeof m.metadata?.pr_number === "number");
    
    // Dedup by PR Number to get distinct past PRs
    const uniquePRs = new Map<number, SimilarPRMatch>();
    for (const match of prMatches) {
      const prNum = match.metadata?.pr_number;
      if (prNum && prNum !== pr_number && !uniquePRs.has(prNum)) {
        uniquePRs.set(prNum, {
          id: match.id,
          score: match.score || 0,
          metadata: match.metadata as PRVectorMetadata
        });
      }
      if (uniquePRs.size >= 5) break; // Keep top 5 unique
    }
    
    const similarPRs = Array.from(uniquePRs.values());
    
    const analysis: PRAnalysis = {
      pr_summary: {
        title: currentPR.title,
        author: currentPR.user?.login || 'unknown',
        files_changed: currentPR.changed_files || 0,
        additions: currentPR.additions || 0,
        deletions: currentPR.deletions || 0,
        url: currentPR.html_url,
        diff_snippets: diffSnippets
      },
      repo_guidelines: guidelines.map((guideline) => ({
        source_file: guideline.metadata?.filename || "unknown",
        content: guideline.metadata?.guideline_content || "",
        similarity_score: guideline.score || 0
      })),
      similar_past_prs: similarPRs.map(pr => ({
        id: pr.id,
        title: pr.metadata?.title || 'Untitled PR',
        similarity_score: pr.score,
        url: pr.metadata?.url || `https://github.com/${owner}/${repo}/pull/${pr.metadata?.pr_number}`
      })),
      recommendations: generateRecommendations(currentPR, similarPRs, files.length, diffSnippets.length)
    };
    
    return {
      content: [{ type: "text" as const, text: JSON.stringify(analysis, null, 2) }]
    };
  } catch (error) {
    logger.error("Error in analyzePR:", error);
    
    return {
      content: [{ type: "text" as const, text: `Error analyzing PR #${pr_number}: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      isError: true
    };
  }
}

function generateRecommendations(
  currentPR: any,
  similarPRs: SimilarPRMatch[],
  totalFiles: number,
  returnedDiffSnippets: number
): PRAnalysis['recommendations'] {
  const recommendations: PRAnalysis['recommendations'] = [];
  
  if (similarPRs.length > 0) {
    recommendations.push({
      type: "historical_context",
      message: `Found ${similarPRs.length} similar past PRs that might provide valuable context for review`,
      priority: "medium"
    });
    
    const highSimilarity = similarPRs.filter(pr => pr.score > 0.8);
    if (highSimilarity.length > 0) {
      recommendations.push({
        type: "high_similarity_alert",
        message: `Found ${highSimilarity.length} highly similar PRs (>80% similarity) - consider reviewing them for patterns`,
        priority: "high"
      });
    }
  }
  
  if (currentPR.additions > 500) {
    recommendations.push({
      type: "size_alert",
      message: "This PR is large (>500 additions). Consider breaking it down for easier review.",
      priority: "high"
    });
  }

  if (totalFiles > returnedDiffSnippets) {
    recommendations.push({
      type: "context_truncation",
      message: `Diff context was capped at ${returnedDiffSnippets} files out of ${totalFiles}. Review the remaining files directly before making a final decision.`,
      priority: "medium"
    });
  }
  
  return recommendations;
}
