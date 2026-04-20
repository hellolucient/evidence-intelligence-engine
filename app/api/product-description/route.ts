import { NextResponse } from "next/server";
import { createModelRouter } from "@/engine/llm/model-router";
import { PROMPT_VERSION } from "@/engine/prompts/registry";

const PRODUCT_DESCRIPTION_SYSTEM = `You are a compliant copywriter for wellness and supplement products. Your task is to generate 3 different SAFE product descriptions based on the GUARDED OUTPUT provided.

CRITICAL REQUIREMENTS:
- You MUST base your descriptions ONLY on the claims and benefits mentioned in the GUARDED OUTPUT
- DO NOT include any claims, benefits, or statements that are NOT present in the GUARDED OUTPUT
- The GUARDED OUTPUT has been evidence-calibrated - use only that content to stay compliant and avoid overstated claims
- Each of the 3 samples MUST include BOTH a title AND a description paragraph
- Write for product packaging, e-commerce, or supplement labels (not for spa menus or treatments)
- Each sample should be distinctly different (e.g. short label copy, longer web copy, benefit-focused)
- Use the same level of certainty as the GUARDED OUTPUT (e.g. "may support" not "supports", "some evidence suggests" not "proven")
- Do NOT make drug claims, disease claims, or guarantee results
- Safe, compliant language: "may help", "supports", "associated with", "some research suggests", "formulated to support"
- Avoid: "cures", "treats", "prevents", "reverses", "guarantees", "proven to"
- Keep tone professional and suitable for retail/regulatory compliance

Format for each sample:
1. **Title** (bold, on its own line) - product or benefit-focused headline
2. Description paragraph (2-4 sentences) - ONLY claims from the GUARDED OUTPUT, in safe product language

Output format:
1. **Title One**
Description paragraph using ONLY claims from the GUARDED OUTPUT in safe product language.

2. **Title Two**
Description paragraph using ONLY claims from the GUARDED OUTPUT in safe product language.

3. **Title Three**
Description paragraph using ONLY claims from the GUARDED OUTPUT in safe product language.

Output ONLY the 3 product descriptions in this format. No preamble, no explanation.`;

export async function POST(request: Request) {
  try {
    const router = createModelRouter();
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const guardedOutput = typeof body?.guardedOutput === "string" ? body.guardedOutput.trim() : null;
    const originalQuery = typeof body?.originalQuery === "string" ? body.originalQuery.trim() : null;

    if (!guardedOutput) {
      return NextResponse.json(
        { error: "Missing or invalid 'guardedOutput' in request body." },
        { status: 400 }
      );
    }

    if (!originalQuery) {
      return NextResponse.json(
        { error: "Missing or invalid 'originalQuery' in request body." },
        { status: 400 }
      );
    }

    try {
      const userMessage = `Original Query: ${originalQuery}\n\nGuarded Output (evidence-calibrated content):\n${guardedOutput}`;
      const productDescriptions = await router.complete({
        taskType: "downstream_product_description",
        promptVersion: PROMPT_VERSION.downstream_product_description,
        systemPrompt: PRODUCT_DESCRIPTION_SYSTEM,
        userMessage,
      });

      const descriptions: string[] = [];
      const sections = productDescriptions.split(/\n\s*(?=\d+\.\s*\*\*)/);

      for (const section of sections) {
        if (!section.trim()) continue;
        const cleaned = section.replace(/^\d+\.\s*/, "").trim();
        if (cleaned.length > 10) descriptions.push(cleaned);
      }

      if (descriptions.length < 3) {
        const altSplit = productDescriptions.split(/\n\s*\n/).filter((block) => block.trim().length > 10);
        if (altSplit.length >= 3) {
          descriptions.length = 0;
          altSplit.slice(0, 3).forEach((block) => {
            const cleaned = block.replace(/^\d+[\.\)]\s*/, "").trim();
            if (cleaned.length > 10) descriptions.push(cleaned);
          });
        }
      }

      const finalDescriptions = descriptions.slice(0, 3);
      while (finalDescriptions.length < 3) {
        finalDescriptions.push("**Product Description**\n\nSafe product description placeholder.");
      }

      return NextResponse.json({ descriptions: finalDescriptions });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Product description error:", errorMessage);
      return NextResponse.json(
        { error: `Product description generation failed: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error occurred.";
    console.error("API route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
