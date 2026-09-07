/** Strip markdown fences and parse the first JSON object or array in an LLM reply. */
export function parseLlmJson(text: string): unknown {
  const trimmed = text
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  let start = -1;
  let endChar = "";
  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    start = objectStart;
    endChar = "}";
  } else if (arrayStart >= 0) {
    start = arrayStart;
    endChar = "]";
  }
  if (start < 0) return null;

  const end = trimmed.lastIndexOf(endChar);
  const slice = end > start ? trimmed.slice(start, end + 1) : trimmed.slice(start);

  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}
