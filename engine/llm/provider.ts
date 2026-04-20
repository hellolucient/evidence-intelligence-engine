/**
 * Swappable LLM provider – OpenAI by default.
 */

export interface LLMProvider {
  complete(systemPrompt: string, userMessage: string): Promise<string>;
}

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_TEMPERATURE = 0.4;

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local for local development."
    );
  }
  return key;
}

export async function completeOpenAIChat(input: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  temperature: number;
}): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: getOpenAIKey() });
  const completion = await openai.chat.completions.create({
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userMessage },
    ],
    temperature: input.temperature,
  });
  const content = completion.choices[0]?.message?.content;
  if (content == null) {
    throw new Error("Empty or missing LLM response");
  }
  return content;
}

export const openAIProvider: LLMProvider = {
  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    return completeOpenAIChat({
      model: DEFAULT_OPENAI_MODEL,
      systemPrompt,
      userMessage,
      temperature: DEFAULT_TEMPERATURE,
    });
  },
};

/** Default provider used by the engine. Swap here or via env to use Anthropic etc. */
export const defaultProvider: LLMProvider = openAIProvider;
