import type OpenAI from "openai";
// RN fetch gövde akışını desteklemez; Expo'nunki destekler (akışlı sohbet şartı).
import { fetch as expoFetch } from "expo/fetch";
import { parseStructuredJson } from "../structparse";
import { completedToolCalls, mergeToolCallDelta, ToolCallDraft } from "../toolstream";
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
    fetch: expoFetch as unknown as typeof globalThis.fetch,
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

/**
 * DeepSeek V4-Pro'nun bilinen kusuru: araç çağrısını bazen `tool_calls`
 * alanı yerine düz metin olarak yazıyor. Bu bizim döngüde SESSİZ bir
 * başarısızlık olurdu — araç hiç çalışmaz (kelime kaydedilmez, kart
 * puanlanmaz) ve öğrenci ekranda ham JSON görür. Yakalayıp modele düzgün
 * mekanizmayı kullanmasını söylüyoruz.
 */
function looksLikeToolCall(text: string, toolNames: string[]): boolean {
  const t = text.trim();
  if (!t.includes("{") || !t.includes("}")) return false;
  return toolNames.some((n) => t.includes(`"${n}"`) || t.includes(`'${n}'`));
}

const TOOL_TEXT_CORRECTION =
  "[Sistem: Az önceki cevabında bir araç çağrısını düz metin olarak yazdın. " +
  "Araçlar metinle çağrılmaz — gerçekten çağırman gerekiyorsa aracı usulüne " +
  "uygun biçimde çağır, gerekmiyorsa öğrenciye dönük cevabını yaz. Ham JSON " +
  "gösterme.]";

async function chat(req: AgenticRequest): Promise<AgenticReply> {
  const openai = client(req.apiKey);
  const tools = toTools(req);
  const actions: string[] = [];
  // Ekrana akanla kaydedilen aynı olsun diye cevap TÜM turların metnidir.
  const textParts: string[] = [];

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: req.stable },
    ...req.messages.map((m, i) => ({
      role: m.role,
      content:
        i === req.messages.length - 1 ? withDynamic(m.content, req.dynamic) : m.content,
    })),
  ];

  for (let round = 0; round < req.maxRounds; round++) {
    req.onRound?.(round);
    // Akış: content delta'ları ekrana damlar; tool_calls parçaları
    // toolstream ile birleştirilir; usage son chunk'ta gelir.
    const stream = await openai.chat.completions.create({
      model: req.model,
      messages,
      tools,
      max_tokens: 8000,
      stream: true,
      stream_options: { include_usage: true },
    });

    let content = "";
    const drafts: ToolCallDraft[] = [];
    let usage: OpenAI.CompletionUsage | undefined;
    let thinkingSignalled = false;
    for await (const chunk of stream) {
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices[0]?.delta as
        | (OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
            reasoning_content?: string | null;
          })
        | undefined;
      if (!delta) continue;
      if (delta.reasoning_content && !thinkingSignalled) {
        thinkingSignalled = true;
        req.onThinking?.();
      }
      if (delta.content) {
        content += delta.content;
        req.onText?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        mergeToolCallDelta(drafts, tc);
      }
    }

    const du = usage as (OpenAI.CompletionUsage & { prompt_cache_hit_tokens?: number }) | undefined;
    void recordUsage({
      model: req.model,
      input: du?.prompt_tokens ?? 0,
      output: du?.completion_tokens ?? 0,
      cacheRead: du?.prompt_cache_hit_tokens ?? 0,
    });
    const text = content.trim();
    if (text) textParts.push(text);

    const calls = completedToolCalls(drafts);
    if (calls.length === 0) {
      const full = textParts.join("\n\n").trim();
      if (!full) throw new Error(EMPTY_TEXT);
      if (
        round < req.maxRounds - 1 &&
        looksLikeToolCall(
          text,
          req.tools.map((t) => t.name)
        )
      ) {
        messages.push({ role: "assistant", content: text });
        messages.push({ role: "user", content: TOOL_TEXT_CORRECTION });
        continue;
      }
      return { text: full, actions };
    }

    messages.push({
      role: "assistant",
      content: text || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: { name: c.name, arguments: c.arguments },
      })),
    });
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

  return { text: textParts.join("\n\n").trim() || BUDGET_EXHAUSTED_TEXT, actions };
}

async function structured<T>(req: StructuredRequest): Promise<T> {
  // AKIŞLA alınır: akışsız istek telefonda dakikalarca tek bayt almadan
  // bekler ve mobil ağda bu sessiz bağlantı kopar (bkz. anthropic.ts).
  const stream = await client(req.apiKey).chat.completions.create({
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
    stream: true,
    stream_options: { include_usage: true },
  });
  let content = "";
  let usage: OpenAI.CompletionUsage | undefined;
  let finish: string | null = null;
  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (choice?.delta?.content) content += choice.delta.content;
  }
  void recordUsage({
    model: req.model,
    input: usage?.prompt_tokens ?? 0,
    output: usage?.completion_tokens ?? 0,
  });
  if (finish === "length") throw new Error(TRUNCATED_TEXT);
  const text = content.trim();
  if (!text) throw new Error(EMPTY_TEXT);
  return parseStructuredJson<T>(text);
}

export const deepseekProvider: Provider = { meta, chat, structured };
