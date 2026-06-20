import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { buildVectorId, cosineSimilarity, createLocalVectorStore } from "../src/utils/vectorStore.js";

test("buildVectorId encodes unsafe path characters", () => {
  assert.equal(
    buildVectorId("owner", "repo.name", 42, "file", "src/tools/analyzePR.ts"),
    "owner/repo%2Ename/42/file/src%2Ftools%2FanalyzePR%2Ets"
  );
});

test("cosineSimilarity ranks identical vectors highest", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("local vector store upserts, filters, and deletes records", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pr-context-engine-"));
  const store = createLocalVectorStore(path.join(directory, "vectors.json"));

  await store.upsert([
    {
      id: "one",
      values: [1, 0],
      metadata: { owner: "acme", repo: "api", pr_number: 1, title: "API auth" }
    },
    {
      id: "two",
      values: [0, 1],
      metadata: { owner: "acme", repo: "web", pr_number: 2, title: "UI auth" }
    }
  ]);

  const queryResult = await store.query({
    topK: 5,
    vector: [1, 0],
    includeMetadata: true,
    filter: { repo: { $eq: "api" } }
  });

  assert.equal(queryResult.matches.length, 1);
  assert.equal(queryResult.matches[0].id, "one");

  const deletedCount = await store.deleteByFilter({ owner: { $eq: "acme" }, repo: { $eq: "api" } });
  assert.equal(deletedCount, 1);

  const postDeleteResult = await store.query({ topK: 5, vector: [1, 0], includeMetadata: true });
  assert.equal(postDeleteResult.matches.length, 1);
  assert.equal(postDeleteResult.matches[0].id, "two");
});
