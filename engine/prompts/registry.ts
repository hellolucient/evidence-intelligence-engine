export const PROMPT_VERSION = {
  raw_answer: "longevity.raw_answer@v2",
  query_parse: "query.parse_slots@v2",
  parse_critic: "query.parse_critic@v1",
  prose_repair: "answer.prose_repair@v1",
  claim_extraction: "claims.extract@v3",
  rewrite_guarded: "rewrite.guarded@v2",
  downstream_menu_description: "downstream.menu@v1",
  downstream_product_description: "downstream.product@v1",
} as const;

export type PromptVersion =
  (typeof PROMPT_VERSION)[keyof typeof PROMPT_VERSION];

