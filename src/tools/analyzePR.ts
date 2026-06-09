import pinecone from "../config/pinecone.config.js";
import octokit from "../config/github.config.js";
import { embeddingService } from "../services/embeddings.service.js";
import type { AnalyzePRInput, PRAnalysis, SimilarPRMatch, PRVectorMetadata } from "../types/index.js";
import { logger } from "../utils/logger.js";

export async function analyzePRTool(input: AnalyzePRInput) {
  const { owner, repo, pr_number } = input;
  
  try {
    logger.info(`Analyzing PR #${pr_number} in ${owner}/${repo}`);
    
    // Fetch basic PR metadata
    const { data: currentPR } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pr_number
    });

    // Fetch PR file diffs to pass back to the LLM Client for Deep Context Review
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pr_number,
      per_page: 50 // Limit to 50 files for LLM Context Window safety
    });

    const diffSnippets = files
      .filter(f => f.patch)
      .map(f => ({
        filename: f.filename,
        status: f.status,
        patch: f.patch?.substring(0, 2000) || "" // Truncate giant files
      }));
    
    // Use the basic metadata to find similar past PRs (General search)
    const prContext = `Title: ${currentPR.title}\nDescription: ${currentPR.body || 'No description provided'}\nAuthor: ${currentPR.user?.login}\nChanges: ${currentPR.changed_files} files, ${currentPR.additions} additions, ${currentPR.deletions} deletions`;
    
    const embedding = await embeddingService.generateEmbeddings(prContext);
    
    const index = pinecone.Index<PRVectorMetadata>("pr-context-engine");
    const queryResponse = await index.query({
      topK: 5,
      vector: embedding,
      includeMetadata: true
    });
    
    const similarPRs: SimilarPRMatch[] = queryResponse.matches?.map((match: any) => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata
    })) || [];
    
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
      similar_past_prs: similarPRs.map(pr => ({
        id: pr.id,
        title: pr.metadata?.title || 'Untitled PR',
        similarity_score: pr.score,
        url: pr.metadata?.url || `https://github.com/${owner}/${repo}/pull/${pr.id.split('/').pop()}`
      })),
      recommendations: generateRecommendations(currentPR, similarPRs)
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

function generateRecommendations(currentPR: any, similarPRs: SimilarPRMatch[]): PRAnalysis['recommendations'] {
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
  
  return recommendations;
}
