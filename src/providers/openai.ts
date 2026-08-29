import type OpenAI from "openai";
// RN fetch gövde akışını desteklemez; Expo'nunki destekler (akışlı sohbet şartı).
import { fetch as expoFetch } from "expo/fetch";
import { parseStructuredJson } from "../structparse";
import { recordUsage } from "../usage";
import {
  AgenticReply,
  AgenticRequest,
  BUDGET_EXHAUSTED_TEXT,
  EMPTY_TEXT,
  Provider,
  ProviderMeta,
  StructuredRequest,
  TRUNCATED_TEXT,
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

/** SDK yalnızca bu sağlayıcı gerçekten kullanıldığında yüklenir (bkz. src/global.d.ts). */
function client(apiKey: string): OpenAI {
  const mod = require("openai");
  const Ctor = mod.default ?? mod.OpenAI ?? mod;
  return new Ctor({
    apiKey,
    dangerouslyAllowBrowser: true,
    fetch: expoFetch as unknown as typeof globalThis.fetch,
  }) as OpenAI;
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
  // Ekrana akanla kaydedilen aynı olsun diye cevap TÜM turların metnidir.
  const textParts: string[] = [];

  const input: OpenAI.Responses.ResponseInput = req.messages.map((m, i) => ({
    role: m.role,
    content:
      i === req.messages.length - 1 ? withDynamic(m.content, req.dynamic) : m.content,
  }));

  for (let round = 0; round < req.maxRounds; round++) {
    req.onRound?.(round);
    // Akış: metin delta'ları geldikçe ekrana damlar; sonda tam yanıt alınır.
    const stream = openai.responses.stream({
      model: req.model,
      instructions: req.stable,
      input,
      tools,
      reasoning: { effort: req.effort },
      max_output_tokens: 16000,
    });
    stream.on("response.output_text.delta", (ev: { delta: string }) => {
      if (ev.delta) req.onText?.(ev.delta);
    });
    stream.on("response.reasoning_summary_part.added", () => req.onThinking?.());
    const response = await stream.finalResponse();

    const u = response.usage;
    void recordUsage({
      model: req.model,
      input: u?.input_tokens ?? 0,
      output: u?.output_tokens ?? 0,
      cacheRead: u?.input_tokens_details?.cached_tokens ?? 0,
    });
    const text = (response.output_text ?? "").trim();
    if (text) textParts.push(text);

    // finalResponse() Parsed* tipleri döndürür; okuduğumuz alanlar (name,
    // arguments, call_id) taban tiple aynı — güvenli daraltma.
    const calls = response.output.filter(
      (item) => item.type === "function_call"
    ) as OpenAI.Responses.ResponseFunctionToolCall[];

    if (calls.length === 0) {
      const full = textParts.join("\n\n").trim();
      if (!full) throw new Error(EMPTY_TEXT);
      return { text: full, actions };
    }

    // Modelin ürettiği öğeleri aynen geri ver, sonra sonuçları ekle
    for (const item of response.output) {
      input.push(item as unknown as OpenAI.Responses.ResponseInputItem);
    }
    for (const call of calls) {
      req.onTool?.(call.name);
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

  return { text: textParts.join("\n\n").trim() || BUDGET_EXHAUSTED_TEXT, actions };
}

async function structured<T>(req: StructuredRequest): Promise<T> {
  // AKIŞLA alınır: akışsız istek telefonda dakikalarca tek bayt almadan
  // bekler ve mobil ağda bu sessiz bağlantı kopar (bkz. anthropic.ts).
  const stream = client(req.apiKey).responses.stream({
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
  const response = await stream.finalResponse();
  void recordUsage({
    model: req.model,
    input: response.usage?.input_tokens ?? 0,
    output: response.usage?.output_tokens ?? 0,
    cacheRead: response.usage?.input_tokens_details?.cached_tokens ?? 0,
  });
  if (response.status === "incomplete") throw new Error(TRUNCATED_TEXT);
  const text = (response.output_text ?? "").trim();
  if (!text) throw new Error(EMPTY_TEXT);
  return parseStructuredJson<T>(text);
}

export const openaiProvider: Provider = { meta, chat, structured };
