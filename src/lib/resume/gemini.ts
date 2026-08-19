import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// The one place the Gemini key is read. Only ever imported by /api/resume/*
// route handlers, so the key stays server-side and never reaches the bundle.
//
// Everything here funnels through generateJson(): every call this feature makes
// wants strict JSON back, so schema mode is not optional plumbing, it is the
// interface.

// gemini-1.5-flash is retired and 404s on a current key, so it is deliberately
// NOT the fallback. Override with GEMINI_MODEL for a different tier.
const DEFAULT_MODEL = "gemini-3.6-flash";

// Generous, because these are thinking models working through a whole resume.
// Still bounded so a hung upstream call fails on our terms instead of burning
// the route's maxDuration and returning a platform timeout page.
//
// Careful: this is not only a client-side abort. The SDK also turns it into an
// `X-Server-Timeout` header, so Google itself kills the generation at this mark
// and answers 504 DEADLINE_EXCEEDED. Raising it past the route's maxDuration
// buys nothing; the way to keep a slow call under the mark is thinkingLevel.
const TIMEOUT_MS = 55_000;

// Read env per call, never at module scope: Next inlines module-scope env at
// build time, which would bake in whatever was set when the bundle was built.
export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

// Re-exported so route handlers can name a level without importing the SDK
// themselves — this file stays the only seam onto it.
export { ThinkingLevel };

export function hasGeminiKey(): boolean {
  return !!process.env.GEMINI_API_KEY?.trim();
}

// Carries an HTTP status so route handlers can pass the cause through to the UI
// instead of flattening everything into a 500. The tab shows these verbatim, so
// the messages are written for the person reading them.
export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

// Strip a ```json fence if one shows up. Schema mode shouldn't produce one, but
// this is one line and turns a whole-request failure into a non-event.
function unfence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return t;
  return t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Run one prompt in JSON schema mode and hand the parsed value to `coerce`.
 *
 * The caller's coerce function is what actually decides the return shape — see
 * schema.ts. Passing the schema to Gemini makes the right shape overwhelmingly
 * likely; coercing makes it certain.
 */
export async function generateJson<T>({
  prompt,
  systemInstruction,
  schema,
  coerce,
  thinkingLevel,
}: {
  prompt: string;
  systemInstruction?: string;
  // Gemini's OpenAPI-ish schema dialect. Typed loosely because the schema
  // objects in schema.ts are `as const` literals, which don't line up with the
  // SDK's mutable Schema interface without a cast at every call site.
  schema: unknown;
  coerce: (value: unknown) => T;
  // Cap the model's thinking when a call is long enough to risk TIMEOUT_MS.
  // Omit it to leave the model on its default budget.
  thinkingLevel?: ThinkingLevel;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError(
      "Resume Tailor needs a Gemini API key. Set GEMINI_API_KEY in your environment.",
      503,
    );
  }

  const model = geminiModel();
  const ai = new GoogleGenAI({ apiKey });

  let raw: string | undefined;
  try {
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        responseMimeType: "application/json",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- const-literal schema vs the SDK's mutable Schema type
        responseSchema: schema as any,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
    // `.text` concatenates the text parts of the first candidate and already
    // excludes thought parts, which these models do emit — so no manual
    // filtering is needed here.
    raw = res.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A wrong or retired model id is the single most likely misconfiguration,
    // and Google reports it as a bare 404, so name the model in the error.
    if (/not found|404/i.test(msg)) {
      throw new GeminiError(
        `Gemini model "${model}" is not available on this API key. Set GEMINI_MODEL to a current model.`,
        502,
      );
    }
    if (/api key|permission|401|403/i.test(msg)) {
      throw new GeminiError("Gemini rejected the API key.", 502);
    }
    if (/abort|timeout|timed out|deadline/i.test(msg)) {
      throw new GeminiError(
        "Gemini took too long to respond. Try again.",
        504,
      );
    }
    throw new GeminiError(`Gemini request failed: ${msg}`, 502);
  }

  if (!raw || !raw.trim()) {
    // Usually a safety block or a max-token stop before any text was emitted.
    throw new GeminiError("Gemini returned an empty response.", 502);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(raw));
  } catch {
    throw new GeminiError(
      "Gemini returned text that was not valid JSON.",
      502,
    );
  }

  return coerce(parsed);
}
