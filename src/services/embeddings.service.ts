import { pipeline } from '@xenova/transformers';
import { logger } from '../utils/logger.js';

export interface IEmbeddingService {
  generateEmbeddings(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

class EmbeddingService implements IEmbeddingService {
  private modelName: string = 'Xenova/all-MiniLM-L6-v2';
  private dimensions: number = 384;
  private extractorPromise: Promise<any>;

  constructor() {
    // Initialize the pipeline dynamically.
    // It will download the model on the first run and cache it.
    this.extractorPromise = pipeline('feature-extraction', this.modelName);
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error("Cannot generate embedding for empty text");
      }

      // Truncate long texts
      const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

      logger.info(`Generating embedding for text (${truncatedText.length} chars) using ${this.modelName}`);

      const extractor = await this.extractorPromise;
      
      // Output is a Tensor. pooling: 'mean' and normalize: true are standard for sentence embeddings.
      const output = await extractor(truncatedText, { pooling: 'mean', normalize: true });
      
      // Convert the Float32Array to a standard JavaScript Array
      const embedding = Array.from(output.data) as number[];

      if (!embedding || embedding.length !== this.dimensions) {
        throw new Error(`Invalid embedding generated: expected ${this.dimensions} dimensions, got ${embedding?.length}`);
      }

      logger.info(`Successfully generated ${embedding.length}-dimension local embedding`);

      return embedding;
    } catch (error) {
      logger.error("Failed to generate local embedding:", error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      logger.info(`Generating batch local embeddings for ${texts.length} texts`);

      const validTexts = texts.map((t) => t.length > 8000 ? t.substring(0, 8000) : t);

      const extractor = await this.extractorPromise;
      
      // Extract embeddings in a single call
      const output = await extractor(validTexts, { pooling: 'mean', normalize: true });

      const embeddings: number[][] = [];
      const dataArray = output.data;
      
      // output.data is a flattened Float32Array. We chunk it by dimensions.
      for (let i = 0; i < validTexts.length; i++) {
        const start = i * this.dimensions;
        const end = start + this.dimensions;
        embeddings.push(Array.from(dataArray.slice(start, end)) as number[]);
      }

      logger.info(`Successfully generated ${embeddings.length} local embeddings`);

      return embeddings;
    } catch (error) {
      logger.error("Failed to generate local batch embeddings:", error);
      throw new Error(`Batch embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
