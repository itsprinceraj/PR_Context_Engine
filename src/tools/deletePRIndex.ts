import type { DeleteIndexResult, DeletePRIndexInput } from "../types/index.js";
import { deleteVectorsByFilter, getVectorStoreName } from "../utils/vectorStore.js";
import { logger } from "../utils/logger.js";

export async function deletePRIndexTool(input: DeletePRIndexInput) {
  const { owner, repo, pr_number } = input;

  try {
    logger.info(`Deleting indexed vectors for PR #${pr_number} in ${owner}/${repo}`);

    const deletedCount = await deleteVectorsByFilter({
      owner: { $eq: owner },
      repo: { $eq: repo },
      pr_number: { $eq: pr_number }
    });

    const result: DeleteIndexResult = {
      success: true,
      message: deletedCount === undefined
        ? `Delete request submitted for PR #${pr_number} in ${owner}/${repo}`
        : `Deleted ${deletedCount} indexed vectors for PR #${pr_number} in ${owner}/${repo}`,
      deleted_count: deletedCount,
      vector_store: getVectorStoreName()
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    logger.error("Error in deletePRIndex:", error);

    const result: DeleteIndexResult = {
      success: false,
      message: `Failed to delete indexed vectors for PR #${pr_number}: ${error instanceof Error ? error.message : "Unknown error"}`,
      vector_store: getVectorStoreName()
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      isError: true
    };
  }
}
