# PR Context Engine

PR Context Engine is an MCP server that gives AI PR reviewers repository memory. It indexes pull requests, file diffs, review comments, and repository guidelines, then retrieves relevant context during review.

## What It Does

Most AI PR reviews only see the current diff. This server adds repository memory:

- Finds similar past PRs and review decisions.
- Retrieves repository rules from docs like `README.md` and `CONTRIBUTING.md`.

- Returns structured review context through MCP tools.
- Runs locally by default, with optional Pinecone for team/shared memory.

## Quick Start
```powershell
npm install
npm run build
npm run inspector
```

By default, the server uses a local JSON vector store at `.pr-context-engine/vector-store.json`. Users do not need a Pinecone key for public repositories. Add `GITHUB_AUTH_TOKEN` only if you need private repositories or higher GitHub API limits.

You can also run the MCP server directly after build:

```powershell
node dist/index.js
```

## Optional Pinecone Mode

Use Pinecone when you want a shared/team vector store instead of local disk.

```env
VECTOR_STORE=pinecone
PINECONE_API_KEY=your_key
PINECONE_INDEX_NAME=pr-context-engine
```

The Pinecone index must use dimension `384` because the default embedding model is `Xenova/all-MiniLM-L6-v2`.

## Recommended User Flow

1. Run `get_server_status` to confirm the active vector store.
2. Run `index_repo_guidelines` for the target repository.
3. Run `index_pr` on 10-50 important merged PRs from the project history.
4. Run `analyze_pr` on a new PR.
5. Use `search_similar_prs` for focused questions like "auth middleware change" or "database migration".
6. Use `delete_pr_index` before reindexing a stale or changed PR.

## MCP Tools

- `index_pr`: indexes PR metadata, changed-file patches, and review comments.
- `index_repo_guidelines`: indexes repository docs such as `README.md`, `CONTRIBUTING.md`, and custom paths.
- `search_similar_prs`: semantically searches indexed PR memory.
- `analyze_pr`: returns current PR summary, diff snippets, relevant guidelines, similar PRs, and recommendations.
- `delete_pr_index`: removes indexed vectors for a PR before reindexing or cleanup.
- `get_server_status`: shows active vector store, embedding model, and available tools without exposing secrets.

## Recommended First Test

1. Run `npm run build`.
2. Run `npm run inspector`.
3. Call `get_server_status` to confirm local or Pinecone mode.
4. Call `index_repo_guidelines` with a public repo.
5. Call `index_pr` for one merged PR from that repo.
6. Call `analyze_pr` on another PR and inspect returned context.

## Retrieval Evaluation

Create an eval file using `examples/retrieval-eval.example.json`, then run:

```powershell
npm run eval:retrieval -- examples/retrieval-eval.example.json 5
```

The command reports `recall_at_k`, hits, expected PRs, and top retrieved results. This is how you measure whether retrieval quality is improving.

## Claude Desktop Example

After `npm run build`, add a server entry like this to your MCP client config:

```json
{
  "mcpServers": {
    "pr-context-engine": {
      "command": "node",
      "args": ["C:/path/to/PR_Context_Engine/dist/index.js"]
    }
  }
}
```

For public repositories, this works without secrets. For private repositories, set `GITHUB_AUTH_TOKEN` in your environment before launching the MCP client.

## Production Notes

The local store is best for single-user local MCP usage. For teams, use Pinecone or another shared vector backend, monitor API failures, rotate tokens, and keep the local `.pr-context-engine` directory out of source control.

See `docs/MCP_DEPLOYMENT_GUIDE.md` for step-by-step MCP setup and `docs/PRODUCTION_GUIDE.md` for release, security, evaluation, and operations guidance.
