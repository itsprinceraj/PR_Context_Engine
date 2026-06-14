import pinecone from "../config/pinecone.config.js";
import { config } from "../config/config.js";
import type { PRVectorMetadata } from "../types/index.js";

const UPSERT_BATCH_SIZE = 100;

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: PRVectorMetadata;
}

export function getPRContextIndex() {
  return pinecone.Index<PRVectorMetadata>(config.pineconeIndexName);
}

export async function upsertVectorsInBatches(vectors: VectorRecord[]): Promise<void> {
  const index = getPRContextIndex();

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    await index.upsert(vectors.slice(i, i + UPSERT_BATCH_SIZE));
  }
}

export function buildVectorId(...parts: Array<string | number>): string {
  return parts
    .map((part) => encodeURIComponent(String(part)).replace(/\./g, "%2E"))
    .join("/");
}
