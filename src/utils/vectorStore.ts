import * as fs from "fs/promises";
import * as path from "path";
import { getPineconeClient } from "../config/pinecone.config.js";
import { config } from "../config/config.js";
import type { PRVectorMetadata, SimilarPRMatch } from "../types/index.js";
import { withRetry } from "./retry.js";

const UPSERT_BATCH_SIZE = 100;

type MetadataFilter = Record<string, unknown>;

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: PRVectorMetadata;
}

export interface VectorQuery {
  topK: number;
  vector: number[];
  includeMetadata?: boolean;
  filter?: MetadataFilter;
}

export interface QueryResponse {
  matches: SimilarPRMatch[];
}

export interface VectorStore {
  readonly name: string;
  query(query: VectorQuery): Promise<QueryResponse>;
  upsert(vectors: VectorRecord[]): Promise<void>;
  deleteByFilter(filter: MetadataFilter): Promise<number | undefined>;
}

interface LocalVectorStoreFile {
  version: 1;
  records: VectorRecord[];
}

class PineconeVectorStore implements VectorStore {
  readonly name = "pinecone";

  private getIndex() {
    return getPineconeClient().Index<PRVectorMetadata>(config.pineconeIndexName);
  }

  async query(query: VectorQuery): Promise<QueryResponse> {
    const response = await withRetry(
      () => this.getIndex().query({
        topK: query.topK,
        vector: query.vector,
        includeMetadata: query.includeMetadata ?? true,
        filter: query.filter
      }),
      { operationName: "Pinecone query" }
    );

    return {
      matches: response.matches.map((match) => ({
        id: match.id,
        score: match.score ?? 0,
        metadata: match.metadata as PRVectorMetadata | undefined
      }))
    };
  }

  async upsert(vectors: VectorRecord[]): Promise<void> {
    const index = this.getIndex();

    for (let start = 0; start < vectors.length; start += UPSERT_BATCH_SIZE) {
      const batch = vectors.slice(start, start + UPSERT_BATCH_SIZE);
      await withRetry(() => index.upsert(batch), { operationName: "Pinecone upsert" });
    }
  }

  async deleteByFilter(filter: MetadataFilter): Promise<number | undefined> {
    await withRetry(() => this.getIndex().deleteMany(filter), { operationName: "Pinecone delete" });
    return undefined;
  }
}

class LocalJsonVectorStore implements VectorStore {
  readonly name = "local";

  constructor(private readonly filePath: string) {}

  async query(query: VectorQuery): Promise<QueryResponse> {
    const store = await this.load();
    const matches = store.records
      .filter((record) => matchesFilter(record.metadata, query.filter))
      .map((record) => ({
        id: record.id,
        score: cosineSimilarity(query.vector, record.values),
        metadata: query.includeMetadata === false ? undefined : record.metadata
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, query.topK);

    return { matches };
  }

  async upsert(vectors: VectorRecord[]): Promise<void> {
    const store = await this.load();
    const recordsById = new Map(store.records.map((record) => [record.id, record]));

    for (const vector of vectors) {
      recordsById.set(vector.id, vector);
    }

    await this.save({ version: 1, records: Array.from(recordsById.values()) });
  }

  async deleteByFilter(filter: MetadataFilter): Promise<number> {
    const store = await this.load();
    const remaining = store.records.filter((record) => !matchesFilter(record.metadata, filter));
    const deletedCount = store.records.length - remaining.length;

    if (deletedCount > 0) {
      await this.save({ version: 1, records: remaining });
    }

    return deletedCount;
  }

  private async load(): Promise<LocalVectorStoreFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as LocalVectorStoreFile;
      if (!Array.isArray(parsed.records)) {
        throw new Error("Invalid local vector store format");
      }
      return parsed;
    } catch (error) {
      if (isFileNotFound(error)) {
        return { version: 1, records: [] };
      }
      throw error;
    }
  }

  private async save(store: LocalVectorStoreFile): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(tmpPath, this.filePath);
  }
}

let vectorStore: VectorStore | undefined;

export function getPRContextIndex(): VectorStore {
  vectorStore ??= config.vectorStore === "pinecone"
    ? new PineconeVectorStore()
    : new LocalJsonVectorStore(config.localVectorStorePath);

  return vectorStore;
}

export function createLocalVectorStore(filePath: string): VectorStore {
  return new LocalJsonVectorStore(filePath);
}

export async function upsertVectorsInBatches(vectors: VectorRecord[]): Promise<void> {
  await getPRContextIndex().upsert(vectors);
}

export async function deleteVectorsByFilter(filter: MetadataFilter): Promise<number | undefined> {
  return getPRContextIndex().deleteByFilter(filter);
}

export function getVectorStoreName(): string {
  return getPRContextIndex().name;
}

export function buildVectorId(...parts: Array<string | number>): string {
  return parts
    .map((part) => encodeURIComponent(String(part)).replace(/\./g, "%2E"))
    .join("/");
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index++) {
    dotProduct += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function matchesFilter(metadata: PRVectorMetadata, filter?: MetadataFilter): boolean {
  if (!filter) return true;

  return Object.entries(filter).every(([key, condition]) => {
    const value = metadata[key];

    if (isFilterOperator(condition)) {
      if ("$eq" in condition && value !== condition.$eq) return false;
      if ("$ne" in condition && value === condition.$ne) return false;
      if ("$in" in condition && (!Array.isArray(condition.$in) || !condition.$in.includes(value))) return false;
      return true;
    }

    return value === condition;
  });
}

function isFilterOperator(value: unknown): value is { $eq?: unknown; $ne?: unknown; $in?: unknown[] } {
  return typeof value === "object" && value !== null && (
    "$eq" in value || "$ne" in value || "$in" in value
  );
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
