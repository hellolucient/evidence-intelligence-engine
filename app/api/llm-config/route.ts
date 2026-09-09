import { NextResponse } from "next/server";
import { getResolvedOpenAIModels } from "@/engine/llm/model-router";

export const dynamic = "force-dynamic";

function hasEnv(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/** Public: which OpenAI model names this deploy will call. Never returns the API key. */
export async function GET() {
  const models = getResolvedOpenAIModels();
  return NextResponse.json({
    cheap: models.cheap,
    reasoning: models.reasoning,
    env_present: {
      OPENAI_API_KEY: hasEnv("OPENAI_API_KEY"),
      EIE_OPENAI_MODEL_CHEAP: hasEnv("EIE_OPENAI_MODEL_CHEAP"),
      EIE_OPENAI_MODEL_REASONING: hasEnv("EIE_OPENAI_MODEL_REASONING"),
    },
  });
}
