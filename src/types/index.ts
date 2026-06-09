import { z } from 'zod';

// Tool input schemas
export const AnalyzePRInputSchema = z.object({
  owner: z.string().describe("GitHub repository owner/username"),
  repo: z.string().describe("GitHub repository name"),
  pr_number: z.number().describe("Pull request number")
});

export const SearchSimilarPRsInputSchema = z.object({
  query: z.string().describe("Search query or code change description"),
  top_k: z.number().optional().default(5).describe("Number of similar PRs to return")
});

export const IndexPRInputSchema = z.object({
  owner: z.string().describe("GitHub repository owner/username"),
  repo: z.string().describe("GitHub repository name"),
  pr_number: z.number().describe("Pull request number to index")
});

// TypeScript types inferred from Zod schemas
export type AnalyzePRInput = z.infer<typeof AnalyzePRInputSchema>;
export type SearchSimilarPRsInput = z.infer<typeof SearchSimilarPRsInputSchema>;
export type IndexPRInput = z.infer<typeof IndexPRInputSchema>;

// Response types
export interface PRAnalysis {
  pr_summary: {
    title: string;
    author: string;
    files_changed: number;
    additions: number;
    deletions: number;
    url?: string;
    diff_snippets?: Array<{
      filename: string;
      status: string;
      patch: string;
    }>;
  };
  similar_past_prs: Array<{
    id: string;
    title: string;
    similarity_score: number;
    url: string;
  }>;
  recommendations: Array<{
    type: string;
    message: string;
    priority?: 'high' | 'medium' | 'low';
  }>;
}

export interface SearchResult {
  query: string;
  total_results: number;
  results: Array<{
    id: string;
    title: string;
    body_preview: string;
    similarity_score: number;
    owner: string;
    repo: string;
    pr_number: number;
  }>;
}

export interface IndexResult {
  success: boolean;
  message: string;
  vector_id: string;
  metadata: {
    title: string;
    author: string;
    files_changed: number;
  };
}

// GitHub PR types
export interface GitHubPR {
  title: string;
  body: string;
  user: { login: string };
  changed_files: number;
  additions: number;
  deletions: number;
  created_at: string;
  html_url: string;
}

// Pinecone vector types
export interface PRVectorMetadata {
  owner: string;
  repo: string;
  pr_number: number;
  title: string;
  body: string;
  author: string;
  created_at: string;
  url: string;
  changed_files: number;
  additions: number;
  deletions: number;
  filename?: string;
  patch?: string;
  [key: string]: any;
}

export interface SimilarPRMatch {
  id: string;
  score: number;
  metadata?: PRVectorMetadata;
}