import OpenAI from "openai";
import {
  AgenticReply,
  AgenticRequest,
  BUDGET_EXHAUSTED_TEXT,
  EMPTY_TEXT,
  Provider,
  ProviderMeta,
  StructuredRequest,
  withDynamic,
  wrapUpNotice,
} from "./types";

/**
 * OpenAI — Responses API üzerinden.
 *
 * Neden Chat Completions değil: GPT-5.4'ten itibaren Chat Completions,
 * reasoning_effort "none" dışındaki değerlerle araç çağırmayı desteklemiyor.
 * Bu uygulamanın hocası araçlarını akıl yürüterek kullandığı için Responses
 * API şart.
 *
 * Önbellek: OpenAI ön-ek önbelleğini otomatik uygular (1024+ token'lık
 * ön-eklerde), ayrıca işaret koymak gerekmiyor.
 */
const meta: ProviderMeta = {
  id: "openai",
  label: "OpenAI (ChatGPT)",
  keyHint: "platform.openai.com → API keys → Create new secret key",
  keyPrefix: "sk-",
  defaultModel: "gpt-5.6-terra",
  models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
  costNote: "sol ≈ 55 TL/ders · terra ≈ 30 TL · luna ≈ 3 TL",
  experimental: true,
};

function client(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

function toTools(req: AgenticRequest): OpenAI.Responses.FunctionTool[] {
  return req.tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
    strict: false,
  }));
}

async function chat(req: AgenticRequest): Promise<AgenticReply> {
  const openai = client(req.apiKey);
  const tools = toTools(req);
  const actions: string[] = [];
  let lastText = "";

  const input: OpenAI.Responses.ResponseInput = req.messages.map((m, i) => ({
    role: m.role,
    content:
      i === req.messages.length - 1 ? withDynamic(m.content, req.dynamic) : m.content,
  }));

  for (let round = 0; round < req.maxRounds; round++) {
    const response = await openai.responses.create({
      model: req.model,
      instructions: req.stable,
      input,
      tools,
      reasoning: { effort: req.effort },
      max_output_tokens: 16000,
    });

    const text = (response.output_text ?? "").trim();
    if (text) lastText = text;

    const calls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call"
    );

    if (calls.length === 0) {
      if (!text) throw new Error(EMPTY_TEXT);
      return { text, actions };
    }

    // Modelin ürettiği öğeleri aynen geri ver, sonra sonuçları ekle
    for (const item of response.output) {
      input.push(item as unknown as OpenAI.Responses.ResponseInputItem);
    }
    for (const call of calls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      const outcome = await req.runTool(call.name, parsed);
      if (outcome.summary) actions.push(outcome.summary);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: outcome.result,
      });
    }

    const remaining = req.maxRounds - round - 1;
    if (remaining <= 3) {
      input.push({ role: "user", content: wrapUpNotice(remaining) });
    }
  }

  return { text: lastText || BUDGET_EXHAUSTED_TEXT, actions };
}

async function structured<T>(req: StructuredRequest): Promise<T> {
  const response = await client(req.apiKey).responses.create({
    model: req.model,
    instructions: req.system,
    input: [{ role: "user", content: req.userMessage }],
    text: {
      format: {
        type: "json_schema",
        name: "sonuc",
        schema: req.schema,
        strict: false,
      },
    },
    max_output_tokens: 16000,
  });
  const text = (response.output_text ?? "").trim();
  if (!text) throw new Error(EMPTY_TEXT);
  return JSON.parse(text) as T;
}

export const openaiProvider: Provider = { meta, chat, structured };
