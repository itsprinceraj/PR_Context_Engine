import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer({
  name: "pr-context-engine",
  version: "1.0.0",
  description:
    "PR analysis engine with RAG capabilities using GitHub & Pinecone",
});

export default server;
