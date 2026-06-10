import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { analyzePRTool } from "./tools/analyzePR.js";
import { searchSimilarPRsTool } from "./tools/searchSimilarPRs.js";
import { indexPRTool } from "./tools/indexPR.js";
import { indexGuidelinesTool } from "./tools/indexGuidelines.js";
import {
  AnalyzePRInputSchema,
  SearchSimilarPRsInputSchema,
  IndexPRInputSchema,
  IndexGuidelinesInputSchema,
} from "./types/index.js";
import server from "./config/mcpServer.config.js";
import { logger } from "./utils/logger.js";

// Register analyze_pr tool
server.registerTool(
  "analyze_pr",
  {
    description: "Analyze a GitHub pull request using RAG from past PRs and documentation",
    inputSchema: AnalyzePRInputSchema.shape,
  },
  async (args) => await analyzePRTool(args)
);

// Register search_similar_prs tool
server.registerTool(
  "search_similar_prs",
  {
    description: "Find past pull requests similar to a given query or code change using semantic search",
    inputSchema: SearchSimilarPRsInputSchema.shape,
  },
  async (args) => await searchSimilarPRsTool(args)
);

// Register index_pr tool
server.registerTool(
  "index_pr",
  {
    description: "Index a pull request into the vector knowledge base for future semantic search and RAG",
    inputSchema: IndexPRInputSchema.shape,
  },
  async (args) => await indexPRTool(args)
);

// Register index_repo_guidelines tool
server.registerTool(
  "index_repo_guidelines",
  {
    description: "Index repository guidelines (CONTRIBUTING.md, README.md, etc.) into the knowledge base",
    inputSchema: IndexGuidelinesInputSchema.shape,
  },
  async (args) => await indexGuidelinesTool(args)
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
