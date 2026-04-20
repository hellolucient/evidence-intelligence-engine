export const PROMPT_VERSION = {
  raw_answer: "longevity.raw_answer@v1",
  claim_extraction: "claims.extract@v1",
  rewrite_guarded: "rewrite.guarded@v1",
  downstream_menu_description: "downstream.menu@v1",
  downstream_product_description: "downstream.product@v1",
} as const;

export type PromptVersion =
  (typeof PROMPT_VERSION)[keyof typeof PROMPT_VERSION];

