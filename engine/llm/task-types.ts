export type TaskType =
  | "raw_answer"
  | "query_parse"
  | "parse_critic"
  | "prose_repair"
  | "claim_extraction"
  | "rewrite"
  | "downstream_menu_description"
  | "downstream_product_description";

export type ModelTier = "cheap" | "reasoning" | "premium";

