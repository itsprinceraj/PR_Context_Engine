import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { analyzePRTool } from "./tools/analyzePR.js";
import { searchSimilarPRsTool } from "./tools/searchSimilarPRs.js";
import { indexPRTool } from "./tools/indexPR.js";
import { indexGuidelinesTool } from "./tools/indexGuidelines.js";
import { deletePRIndexTool } from "./tools/deletePRIndex.js";
import { getServerStatusTool } from "./tools/getServerStatus.js";
import {
  AnalyzePRInputSchema,
  SearchSimilarPRsInputSchema,
  IndexPRInputSchema,
  IndexGuidelinesInputSchema,
  DeletePRIndexInputSchema,
} from "./types/index.js";
import { z } from "zod";
import server from "./config/mcpServer.config.js";
import { logger } from "./utils/logger.js";
import { trackToolCall } from "./utils/metrics.js";

// Register analyze_pr tool
server.registerTool(
  "analyze_pr",
  {
    description: "Analyze a GitHub pull request using RAG from past PRs and documentation",
    inputSchema: AnalyzePRInputSchema.shape,
  },
  async (args) => await trackToolCall("analyze_pr", () => analyzePRTool(args))
);

// Register search_similar_prs tool
server.registerTool(
  "search_similar_prs",
  {
    description: "Find past pull requests similar to a given query or code change using semantic search",
    inputSchema: SearchSimilarPRsInputSchema.shape,
  },
  async (args) => await trackToolCall("search_similar_prs", () => searchSimilarPRsTool(args))
);

// Register index_pr tool
server.registerTool(
  "index_pr",
  {
    description: "Index a pull request into the vector knowledge base for future semantic search and RAG",
    inputSchema: IndexPRInputSchema.shape,
  },
  async (args) => await trackToolCall("index_pr", () => indexPRTool(args))
);

// Register index_repo_guidelines tool
server.registerTool(
  "index_repo_guidelines",
  {
    description: "Index repository guidelines (CONTRIBUTING.md, README.md, etc.) into the knowledge base",
    inputSchema: IndexGuidelinesInputSchema.shape,
  },
  async (args) => await trackToolCall("index_repo_guidelines", () => indexGuidelinesTool(args))
);

server.registerTool(
  "delete_pr_index",
  {
    description: "Delete indexed vectors for a pull request so stale PR memory can be cleaned or reindexed",
    inputSchema: DeletePRIndexInputSchema.shape,
  },
  async (args) => await trackToolCall("delete_pr_index", () => deletePRIndexTool(args))
);

server.registerTool(
  "get_server_status",
  {
    description: "Show server configuration, active vector store, embedding model, and available tools without exposing secrets",
    inputSchema: z.object({}).shape,
  },
  async () => await trackToolCall("get_server_status", () => getServerStatusTool())
);
// Initialize and start the server
async function startServer(): Promise<void> {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info("PR Context Engine MCP Server started successfully");
    logger.info("Server is ready and waiting for requests...");
  } catch (error) {
    logger.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Start the server
startServer();
