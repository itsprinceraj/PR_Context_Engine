import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Initialize Pinecone
import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "./config/config";
const pinecone = new Pinecone({ apiKey: config.pineconeApiKey });

// Initialize Github
import { Octokit } from "@octokit/rest";
import { required } from "joi";
const octokit = new Octokit({ auth: config.githubAuthToken });

// Initialize MCP Server
const server = new Server(
  {
    name: "pr-context-engine",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  tools: [
    {
      name: "analyze_pr",
      description:
        "Analyze a Github pull request, using RAG from past PRs and docs",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pr_number: { type: "number" },
          model: { type: "string" },
        },
        required: ["owner", "repo", "pr_number", "pineconeIdx"],
      },
      annotations: { readonlyHint: true },
    },
    {
      name: "search_similar_prs",
      description: "Find past PRs similar to a given query or code change",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          top_k: { type: "number", default: 5 },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "index_pr",
      description: "Index a PR into the knowledge base for future reference",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pr_number: { type: "number" },
        },
        required: ["owner", "repo", "pr_number"],
      },
      annotations: { destructiveHint: true },
    },
  ];
});

// Implement tool handlers
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  switch (name) {
    case "analyze_pr":
      return await analyzePR(args as any);
    case "search_similar_prs":
      return await searchSimilarPRs(args as any);
    case "index_pr":
      return await indexPR(args as any);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const analyzePR = async (args: any) => {
  const { owner, repo, pr_number, model } = args;

  try {
  } catch (error) {}
};

const searchSimilarPRs = async (args: any) => {
  const { query, top_k } = args;
  const embedding = await generateEmbeddings(query);
  const index = pinecone.Index("pr-context-engine");
  const results = index.query({
    topK: top_k,
    vector: embedding,
    includeMetadata: true,
  });
  return results;
};

const indexPR = async (args: any) => {
  const { owner, repo, pr_number } = args;
  const pr = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pr_number,
  });
  const embedding = await generateEmbeddings(pr.data.body);
  const index = pinecone.Index("pr-context-engine");
  await index.upsert({
    vectors: [
      {
        id: `${owner}/${repo}/${pr_number}`,
        values: embedding,
        metadata: {
          owner,
          repo,
          pr_number,
          title: pr.data.title,
          body: pr.data.body,
        },
      },
    ],
  });
};
