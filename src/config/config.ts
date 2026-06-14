import * as dotenv from "dotenv";
import * as path from "path";
import * as Joi from "joi";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envVarsSchema = Joi.object().keys({
    PINECONE_API_KEY: Joi.string().required().description("Pinecone API key is required"),
    PINECONE_INDEX_NAME: Joi.string().default("pr-context-engine").description("Pinecone index name"),
    GITHUB_AUTH_TOKEN: Joi.string().optional().allow("").description("GitHub token for authenticated API calls"),
}).unknown();

const {value: envVars, error} = envVarsSchema.prefs({ errors: { label: "key" } }).validate(process.env)

if(error){
    throw new Error(`Config validation error: ${error.message}`)
}

export const config = {
    pineconeApiKey : envVars.PINECONE_API_KEY,
    pineconeIndexName: envVars.PINECONE_INDEX_NAME,
    githubAuthToken: envVars.GITHUB_AUTH_TOKEN || undefined
};
