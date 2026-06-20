import * as assert from "node:assert/strict";
import test from "node:test";
import { rerankMatches, tokenize } from "../src/utils/reranker.js";

test("tokenize removes stop words and duplicates", () => {
  assert.deepEqual(tokenize("Fix the auth auth flow for API"), ["fix", "auth", "flow", "api"]);
});

test("rerankMatches boosts lexical overlap while preserving vector quality", () => {
  const results = rerankMatches(
    "auth middleware token validation",
    [
      {
        id: "vector-only",
        score: 0.9,
        metadata: { owner: "acme", repo: "api", pr_number: 1, title: "billing export" }
      },
      {
        id: "semantic-plus-lexical",
        score: 0.82,
        metadata: { owner: "acme", repo: "api", pr_number: 2, title: "auth middleware token validation" }
      }
    ],
    2
  );

  assert.equal(results[0].id, "semantic-plus-lexical");
  assert.ok(results[0].rerank_score > results[1].rerank_score);
  assert.deepEqual(results[0].matched_terms, ["auth", "middleware", "token", "validation"]);
});
