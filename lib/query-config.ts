/**
 * Configuration for query expansion and validation features.
 * Controls when to use LLM-based enhancements vs automatic normalization.
 */

/**
 * Enable LLM-based query expansion for all searches.
 * When disabled, only automatic normalization is used (hyphen handling, plurals, etc.)
 * 
 * Set EIE_USE_LLM_QUERY_EXPANSION=true to enable globally.
 */
export function useLLMQueryExpansion(): boolean {
  return process.env.EIE_USE_LLM_QUERY_EXPANSION === "true";
}

/**
 * Enable query validation before executing PubMed searches.
 * Adds one LLM call to validate the query, but catches narrow/broad issues.
 * 
 * Set EIE_VALIDATE_QUERIES=true to enable.
 */
export function validateQueries(): boolean {
  return process.env.EIE_VALIDATE_QUERIES === "true";
}

/**
 * Get configuration summary for debugging
 */
export function getQueryEnhancementConfig() {
  return {
    llmExpansion: useLLMQueryExpansion(),
    validation: validateQueries(),
    autoNormalization: true, // Always enabled
  };
}
