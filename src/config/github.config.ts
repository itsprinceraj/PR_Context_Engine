import { Octokit } from "@octokit/rest";
import { config } from "./config.js";

const octokit = new Octokit(
  config.githubAuthToken ? { auth: config.githubAuthToken } : {}
);

export default octokit;
