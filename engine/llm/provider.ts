/**
 * Swappable LLM provider – OpenAI by default.
 */

export interface LLMProvider {
  complete(systemPrompt: string, userMessage: string): Promise<string>;
}

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local for local development."
    );
  }
  return key;
}

export const openAIProvider: LLMProvider = {
  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: getOpenAIKey() });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
    });
    const content = completion.choices[0]?.message?.content;
    if (content == null) {
      throw new Error("Empty or missing LLM response");
    }
    return content;
  },
};

/** Default provider used by the engine. Swap here or via env to use Anthropic etc. */
export const defaultProvider: LLMProvider = openAIProvider;
