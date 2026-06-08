import { config } from "../config/config.js";
import { Pinecone } from "@pinecone-database/pinecone";

const pinecone = new Pinecone({ apiKey: config.pineconeApiKey });
export default pinecone;
