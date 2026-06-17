import { z } from 'zod';

const GitHubOwnerSchema = z.string().trim().min(1).max(39).regex(/^[A-Za-z0-9-]+$/, {
  message: "GitHub owner can only contain letters, numbers, and hyphens"
});

const GitHubRepoSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/, {
  message: "GitHub repo can only contain letters, numbers, dots, underscores, and hyphens"
});

const PRNumberSchema = z.number().int().positive();

// Tool input schemas
export const AnalyzePRInputSchema = z.object({
  owner: GitHubOwnerSchema.describe("GitHub repository owner/username"),
  repo: GitHubRepoSchema.describe("GitHub repository name"),
  pr_number: PRNumberSchema.describe("Pull request number")
});

export const SearchSimilarPRsInputSchema = z.object({
  query: z.string().trim().min(1).max(8000).describe("Search query or code change description"),
  owner: GitHubOwnerSchema.optional().describe("Optional GitHub repository owner/username to scope search"),
  repo: GitHubRepoSchema.optional().describe("Optional GitHub repository name to scope search"),
  top_k: z.number().int().min(1).max(20).optional().default(5).describe("Number of similar PRs to return")
});

export const IndexPRInputSchema = z.object({
  owner: GitHubOwnerSchema.describe("GitHub repository owner/username"),
  repo: GitHubRepoSchema.describe("GitHub repository name"),
  pr_number: PRNumberSchema.describe("Pull request number to index")
});

export const IndexGuidelinesInputSchema = z.object({
  owner: GitHubOwnerSchema.describe("GitHub repository owner/username"),
  repo: GitHubRepoSchema.describe("GitHub repository name"),
  paths: z.array(z.string().trim().min(1).max(200)).max(25).optional().describe("Optional guideline/doc paths to index")
});

export const DeletePRIndexInputSchema = z.object({
  owner: GitHubOwnerSchema.describe("GitHub repository owner/username"),
  repo: GitHubRepoSchema.describe("GitHub repository name"),
  pr_number: PRNumberSchema.describe("Pull request number to remove from the vector knowledge base")
});

// TypeScript types inferred from Zod schemas
export type AnalyzePRInput = z.infer<typeof AnalyzePRInputSchema>;
export type SearchSimilarPRsInput = z.infer<typeof SearchSimilarPRsInputSchema>;
export type IndexPRInput = z.infer<typeof IndexPRInputSchema>;
export type IndexGuidelinesInput = z.infer<typeof IndexGuidelinesInputSchema>;
export type DeletePRIndexInput = z.infer<typeof DeletePRIndexInputSchema>;

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
  repo_guidelines?: Array<{
    source_file: string;
    content: string;
    similarity_score: number;
  }>;
  similar_past_prs: Array<{
    id: string;
    title: string;
    similarity_score: number;
    rerank_score?: number;
    matched_terms?: string[];
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
    rerank_score?: number;
    lexical_score?: number;
    matched_terms?: string[];
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

export interface DeleteIndexResult {
  success: boolean;
  message: string;
  deleted_count?: number;
  vector_store: string;
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
  pr_number?: number;
  title?: string;
  body?: string;
  author?: string;
  created_at?: string;
  url?: string;
  changed_files?: number;
  additions?: number;
  deletions?: number;
  filename?: string;
  patch?: string;
  is_guideline?: boolean;
  guideline_content?: string;
  is_review_comment?: boolean;
  review_comment?: string;
  [key: string]: any;
}

export interface SimilarPRMatch {
  id: string;
  score: number;
  metadata?: PRVectorMetadata;
}
