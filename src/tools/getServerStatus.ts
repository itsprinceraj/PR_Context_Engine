import { config } from "../config/config.js";
import { getMetricsSnapshot } from "../utils/metrics.js";
import { getVectorStoreName } from "../utils/vectorStore.js";

export async function getServerStatusTool() {
  const status = {
    name: "pr-context-engine",
    vector_store: getVectorStoreName(),
    local_vector_store_path: config.vectorStore === "local" ? config.localVectorStorePath : undefined,
    pinecone_index_name: config.vectorStore === "pinecone" ? config.pineconeIndexName : undefined,
    github_auth_configured: Boolean(config.githubAuthToken),
    embedding_model: "Xenova/all-MiniLM-L6-v2",
    embedding_dimensions: 384,
    metrics: getMetricsSnapshot(),
    tools: [
      "analyze_pr",
      "search_similar_prs",
      "index_pr",
      "index_repo_guidelines",
      "delete_pr_index",
      "get_server_status"
    ]
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }]
  };
}
