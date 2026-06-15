import { config } from "../config/config.js";
import { Pinecone } from "@pinecone-database/pinecone";

let pinecone: Pinecone | undefined;

export function getPineconeClient(): Pinecone {
  if (!config.pineconeApiKey) {
    throw new Error("Pinecone is not configured. Set VECTOR_STORE=pinecone and PINECONE_API_KEY to use Pinecone.");
  }

  pinecone ??= new Pinecone({ apiKey: config.pineconeApiKey });
  return pinecone;
}

export default getPineconeClient;
