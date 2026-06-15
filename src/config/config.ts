import * as dotenv from "dotenv";
import * as path from "path";
import Joi from "joi";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env"), quiet: true });

const envVarsSchema = Joi.object().keys({
    VECTOR_STORE: Joi.string().valid("auto", "local", "pinecone").default("auto").description("Vector store backend"),
    LOCAL_VECTOR_STORE_PATH: Joi.string().default(".pr-context-engine/vector-store.json").description("Local vector store path"),
    PINECONE_API_KEY: Joi.string().optional().allow("").description("Pinecone API key"),
    PINECONE_INDEX_NAME: Joi.string().default("pr-context-engine").description("Pinecone index name"),
    GITHUB_AUTH_TOKEN: Joi.string().optional().allow("").description("GitHub token for authenticated API calls"),
}).unknown();

const {value: envVars, error} = envVarsSchema.prefs({ errors: { label: "key" } }).validate(process.env)

if(error){
    throw new Error(`Config validation error: ${error.message}`)
}

const pineconeApiKey = envVars.PINECONE_API_KEY || undefined;
const vectorStore = envVars.VECTOR_STORE === "auto"
    ? (pineconeApiKey ? "pinecone" : "local")
    : envVars.VECTOR_STORE;

if (vectorStore === "pinecone" && !pineconeApiKey) {
    throw new Error("Config validation error: PINECONE_API_KEY is required when VECTOR_STORE=pinecone");
}

export const config = {
    projectRoot: path.resolve(__dirname, "../.."),
    vectorStore,
    localVectorStorePath: path.resolve(path.resolve(__dirname, "../.."), envVars.LOCAL_VECTOR_STORE_PATH),
    pineconeApiKey,
    pineconeIndexName: envVars.PINECONE_INDEX_NAME,
    githubAuthToken: envVars.GITHUB_AUTH_TOKEN || undefined
};
