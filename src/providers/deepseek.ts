import type OpenAI from "openai";
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
 * DeepSeek — OpenAI uyumlu Chat Completions arayüzü üzerinden (aynı SDK,
 * farklı baseURL). OpenAI'ın Responses API'si burada yok, klasik
 * messages/tool_calls şekli kullanılıyor.
 *
 * Önbellek: DeepSeek bağlam önbelleğini otomatik uygular.
 * Fiyat: hafta içi 01:00–04:00 ve 06:00–10:00 UTC'de (TR 04:00–07:00 ve
 * 09:00–13:00) iki katına çıkar.
 */
const meta: ProviderMeta = {
  id: "deepseek",
  label: "DeepSeek",
  keyHint: "platform.deepseek.com → API keys",
  keyPrefix: "sk-",
  defaultModel: "deepseek-v4-pro",
  models: ["deepseek-v4-pro", "deepseek-v4-flash"],
  costNote: "V4 Pro ≈ 7 TL/ders · V4 Flash ≈ 2,4 TL (yoğun saatte 2 katı)",
  experimental: true,
};

/** SDK yalnızca bu sağlayıcı gerçekten kullanıldığında yüklenir. */
function client(apiKey: string): OpenAI {
  const mod = require("openai");
  const Ctor = mod.default ?? mod.OpenAI ?? mod;
  return new Ctor({
    apiKey,
    baseURL: "https://api.deepseek.com",
    dangerouslyAllowBrowser: true,
  }) as OpenAI;
}

function toTools(req: AgenticRequest): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return req.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

async function chat(req: AgenticRequest): Promise<AgenticReply> {
  const openai = client(req.apiKey);
  const tools = toTools(req);
  const actions: string[] = [];
  let lastText = "";

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: req.stable },
    ...req.messages.map((m, i) => ({
      role: m.role,
      content:
        i === req.messages.length - 1 ? withDynamic(m.content, req.dynamic) : m.content,
    })),
  ];

  for (let round = 0; round < req.maxRounds; round++) {
    const response = await openai.chat.completions.create({
      model: req.model,
      messages,
      tools,
      max_tokens: 8000,
    });

    const choice = response.choices[0];
    const text = (choice?.message?.content ?? "").trim();
    if (text) lastText = text;

    const calls = choice?.message?.tool_calls ?? [];
    if (calls.length === 0) {
      if (!text) throw new Error(EMPTY_TEXT);
      return { text, actions };
    }

    messages.push(choice.message);
    for (const call of calls) {
      if (call.type !== "function") continue;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      const outcome = await req.runTool(call.function.name, parsed);
      if (outcome.summary) actions.push(outcome.summary);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: outcome.result,
      });
    }

    const remaining = req.maxRounds - round - 1;
    if (remaining <= 3) {
      messages.push({ role: "user", content: wrapUpNotice(remaining) });
    }
  }

  return { text: lastText || BUDGET_EXHAUSTED_TEXT, actions };
}

async function structured<T>(req: StructuredRequest): Promise<T> {
  const response = await client(req.apiKey).chat.completions.create({
    model: req.model,
    messages: [
      {
        role: "system",
        content: `${req.system}\n\nCevabını SADECE şu JSON şemasına uyan geçerli bir JSON olarak ver, başka hiçbir metin ekleme:\n${JSON.stringify(req.schema)}`,
      },
      { role: "user", content: req.userMessage },
    ],
    response_format: { type: "json_object" },
    max_tokens: 8000,
  });
  const text = (response.choices[0]?.message?.content ?? "").trim();
  if (!text) throw new Error(EMPTY_TEXT);
  return JSON.parse(text) as T;
}

export const deepseekProvider: Provider = { meta, chat, structured };
