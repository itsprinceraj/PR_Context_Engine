import * as dotenv from "dotenv";
import * as path from "path";
import * as Joi from "joi";

dotenv.config({path: path.join(__dirname, "../../.env")})

const envVarsSchema = Joi.object().keys({
    PINECONE_API_KEY: Joi.string().required().description("Pinecone API key is required"),
}).unknown();

const {value: envVars, error} = envVarsSchema.prefs({ errors: { label: "key" } }).validate(process.env)

if(error){
    throw new Error(`Config validation error: ${error.message}`)
}


export const config = {
    pineconeApiKey : envVars.PINECONE_API_KEY,
    githubAuthToken: envVars.GITHUB_AUTH_TOKEN
};