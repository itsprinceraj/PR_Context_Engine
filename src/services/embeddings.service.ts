import OpenAI from "openai";

// Initialize OpenAI (or use another embedding provider)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface IEmbeddingService {
  generateEmbeddings(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

class EmbeddingService implements IEmbeddingService {
  private model: string = "text-embedding-3-small";
  private dimensions: number = 1536;

  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      // Validate input
      if (!text || text.trim().length === 0) {
        throw new Error("Cannot generate embedding for empty text");
      }

      // Truncate long texts to avoid token limits
      const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

      console.error(
        `Generating embedding for text (${truncatedText.length} chars)`,
      );

      // Call OpenAI embeddings API
      const response = await openai.embeddings.create({
        model: this.model,
        input: truncatedText,
        encoding_format: "float",
      });

      const embedding = response.data[0].embedding;

      if (!embedding || embedding.length !== this.dimensions) {
        throw new Error(
          `Invalid embedding generated: expected ${this.dimensions} dimensions, got ${embedding?.length}`,
        );
      }

      console.error(
        `Successfully generated ${embedding.length}-dimension embedding`,
      );

      return embedding;
    } catch (error) {
      console.error("Failed to generate embedding:", error);
      throw new Error(
        `Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      console.error(`Generating batch embeddings for ${texts.length} texts`);

      const validTexts = texts.map((t) =>
        t.length > 8000 ? t.substring(0, 8000) : t,
      );

      const response = await openai.embeddings.create({
        model: this.model,
        input: validTexts,
        encoding_format: "float",
      });

      const embeddings = response.data.map((item) => item.embedding);

      console.error(`Successfully generated ${embeddings.length} embeddings`);

      return embeddings;
    } catch (error) {
      console.error("Failed to generate batch embeddings:", error);
      throw new Error(
        `Batch embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
