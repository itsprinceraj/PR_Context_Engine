# Security

## Secrets

Do not commit `.env` files. Use `.env.example` for public documentation and keep real values in local environment variables or a secret manager.

If a GitHub or Pinecone token is exposed, rotate it immediately.

## Data Flow

- GitHub API returns PR metadata, file diffs, review comments, and docs.
- Local mode stores embeddings and metadata in `.pr-context-engine/vector-store.json`.
- Pinecone mode sends embeddings and metadata to the configured Pinecone index.
- The embedding model runs locally through `@xenova/transformers`.

## Permissions

Use a GitHub token with the minimum repository access needed. Public repositories can work without a token, but private repositories require one.

## Public Usage

For public distribution, document exactly what metadata is stored and provide a cleanup path with `delete_pr_index`.
