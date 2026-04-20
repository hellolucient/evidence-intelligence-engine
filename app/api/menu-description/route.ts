import { NextResponse } from "next/server";
import { createModelRouter } from "@/engine/llm/model-router";
import { PROMPT_VERSION } from "@/engine/prompts/registry";

const MENU_DESCRIPTION_SYSTEM = `You are a spa treatment menu writer. Your task is to generate 3 different menu descriptions for a spa offering based on the GUARDED OUTPUT provided.

CRITICAL REQUIREMENTS:
- You MUST base your descriptions ONLY on the claims and benefits mentioned in the GUARDED OUTPUT
- DO NOT include any claims, benefits, or statements that are NOT present in the GUARDED OUTPUT
- The GUARDED OUTPUT has been evidence-calibrated - it only contains claims that have passed rigorous evidence analysis
- Each of the 3 samples MUST include BOTH a title AND a description paragraph
- Each sample MUST be directly related to the intervention mentioned - do NOT create unrelated spa treatments
- For lifestyle interventions (fasting, nutrition, exercise, supplements, etc.): Generate ONLY consulting sessions, workshops, or educational programs - NOT hands-on spa treatments like massages, facials, or body wraps
- For hands-on interventions (sauna, cold exposure): You may generate treatment descriptions
- Each sample should be distinctly different from the others (different format, angle, or approach)

Format for each sample:
1. **Title** (bold, on its own line) - MUST include the intervention name
2. Description paragraph (2-4 sentences) - MUST only reference benefits/claims from the GUARDED OUTPUT

Each description should:
- Be professional, inviting, and appealing to spa clients
- ONLY mention benefits and claims that appear in the GUARDED OUTPUT
- Use the same level of certainty and language as the GUARDED OUTPUT (e.g., if it says "may improve", don't say "improves")
- Be concise but complete (2-4 sentences for the description paragraph)
- Use appropriate spa/wellness language:
  * For consulting: "personalized guidance", "expert consultation", "one-on-one session", "customized protocol"
  * For workshops: "educational experience", "interactive session", "practical tools", "supportive atmosphere"
  * For programs: "comprehensive program", "structured approach", "guided journey"
- Avoid medical claims or overly technical language
- Vary the approach: one might focus on benefits, another on the experience, another on outcomes
- DO NOT create unrelated spa treatments - if the intervention is "intermittent fasting", do NOT create a "body wrap" or "massage" description
- DO NOT add claims or benefits that are not in the GUARDED OUTPUT

Output format:
1. **Title One** (must relate to the intervention)
Description paragraph using ONLY claims from the GUARDED OUTPUT.

2. **Title Two** (must relate to the intervention, different format)
Description paragraph using ONLY claims from the GUARDED OUTPUT.

3. **Title Three** (must relate to the intervention, different format)
Description paragraph using ONLY claims from the GUARDED OUTPUT.

Output ONLY the 3 menu descriptions in this format. No preamble, no explanation.`;

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
      const menuDescriptions = await router.complete({
        taskType: "downstream_menu_description",
        promptVersion: PROMPT_VERSION.downstream_menu_description,
        systemPrompt: MENU_DESCRIPTION_SYSTEM,
        userMessage,
      });
      
      // Parse the response into an array of descriptions
      // Expected format: "1. **Title**\nDescription paragraph.\n\n2. **Title**\nDescription..."
      const descriptions: string[] = [];
      
      // Split by numbered sections (1., 2., 3.)
      const sections = menuDescriptions.split(/\n\s*(?=\d+\.\s*\*\*)/);
      
      for (const section of sections) {
        if (!section.trim()) continue;
        
        // Remove the number prefix (e.g., "1. ")
        const cleaned = section.replace(/^\d+\.\s*/, "").trim();
        
        // If the section has content, add it
        if (cleaned.length > 10) {
          // Ensure proper formatting: title on one line, description on following lines
          descriptions.push(cleaned);
        }
      }
      
      // If we didn't get 3 from numbered sections, try alternative parsing
      if (descriptions.length < 3) {
        // Try splitting by double newlines
        const altSplit = menuDescriptions.split(/\n\s*\n/).filter(block => block.trim().length > 10);
        if (altSplit.length >= 3) {
          descriptions.length = 0;
          altSplit.slice(0, 3).forEach(block => {
            const cleaned = block.replace(/^\d+[\.\)]\s*/, '').trim();
            if (cleaned.length > 10) {
              descriptions.push(cleaned);
            }
          });
        }
      }
      
      // Ensure we have exactly 3 descriptions
      const finalDescriptions = descriptions.slice(0, 3);
      while (finalDescriptions.length < 3) {
        finalDescriptions.push("**Menu Description**\n\nMenu description placeholder text.");
      }

      return NextResponse.json({ descriptions: finalDescriptions });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Menu description error:", errorMessage);
      return NextResponse.json(
        { error: `Menu description generation failed: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error occurred.";
    console.error("API route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
