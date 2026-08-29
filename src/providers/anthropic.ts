import Anthropic from "@anthropic-ai/sdk";
// RN'in kendi fetch'i gövde akışını (ReadableStream) desteklemez; Expo'nunki
// destekler. Akışlı sohbetin çalışmasının ön şartı bu import.
import { fetch as expoFetch } from "expo/fetch";
import { buildMessages, cachedTools, systemBlocks } from "../caching";
import { parseStructuredJson } from "../structparse";
import { recordUsage } from "../usage";
import {
  AgenticReply,
  AgenticRequest,
  BUDGET_EXHAUSTED_TEXT,
  EMPTY_TEXT,
  Provider,
  ProviderMeta,
  REFUSAL_TEXT,
  StructuredRequest,
  TRUNCATED_TEXT,
  wrapUpNotice,
} from "./types";

const meta: ProviderMeta = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  keyHint: "console.anthropic.com → API Keys → Create Key",
  keyPrefix: "sk-ant-",
  defaultModel: "claude-opus-5",
  models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  costNote: "Opus 5 ≈ 35–70 TL/ders · Sonnet 5 ≈ 28 TL/ders",
  experimental: false,
};

function client(apiKey: string): Anthropic {
  // Kişisel uygulama: anahtar kullanıcının cihazında saklanır ve istekler
  // doğrudan cihazdan Anthropic'e gider.
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    fetch: expoFetch as unknown as typeof globalThis.fetch,
  });
}

function toTools(req: AgenticRequest): Anthropic.Tool[] {
  return cachedTools(
    req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool["input_schema"],
    }))
  );
}

/** Bu kadar tur kalınca modele "toparla" uyarısı iletilir. */
const WRAP_UP_AT = 3;

/**
 * Bir model turunu AKIŞLA çalıştırır: metin geldikçe onText'e damlar,
 * düşünme başlarsa onThinking tetiklenir; sonda tam mesaj döner (araç
 * blokları ve usage dahil) ve döngü eskisi gibi onunla ilerler.
 */
async function streamRound(
  anthropic: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  req: AgenticRequest
): Promise<Anthropic.Message> {
  const stream = anthropic.messages.stream(params);
  stream.on("text", (delta) => {
    if (delta) req.onText?.(delta);
  });
  stream.on("streamEvent", (ev) => {
    if (ev.type === "content_block_start" && ev.content_block.type === "thinking") {
      req.onThinking?.();
    }
  });
  return stream.finalMessage();
}

async function chat(req: AgenticRequest): Promise<AgenticReply> {
  const anthropic = client(req.apiKey);
  const tools = toTools(req);
  const history = buildMessages(req.messages, req.dynamic);
  const actions: string[] = [];
  // Ekrana akanla kaydedilen aynı olsun diye cevap TÜM turların metnidir
  // (araç öncesi "bakayım…" girişleri dahil) — akış sonunda içerik küçülmez.
  const textParts: string[] = [];

  for (let round = 0; round < req.maxRounds; round++) {
    req.onRound?.(round);
    const response = await streamRound(
      anthropic,
      {
        model: req.model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: req.effort },
        system: systemBlocks(req.stable),
        tools,
        messages: history,
      },
      req
    );

    void recordUsage({
      model: req.model,
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    });

    if (response.stop_reason === "refusal") throw new Error(REFUSAL_TEXT);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) textParts.push(text);

    // Sunucu tarafı araç döngüsü duraklarsa aynı geçmişle devam et
    if (response.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use") {
      const full = textParts.join("\n\n").trim();
      if (!full) throw new Error(EMPTY_TEXT);
      return { text: full, actions };
    }

    // Thinking blokları dahil içeriği aynen geri ver
    history.push({ role: "assistant", content: response.content });
    const results: Anthropic.ContentBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      req.onTool?.(block.name);
      const outcome = await req.runTool(
        block.name,
        block.input as Record<string, unknown>
      );
      if (outcome.summary) actions.push(outcome.summary);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: outcome.result,
      });
    }

    const remaining = req.maxRounds - round - 1;
    if (remaining <= WRAP_UP_AT) {
      results.push({ type: "text", text: wrapUpNotice(remaining) });
    }
    history.push({ role: "user", content: results });
  }

  return { text: textParts.join("\n\n").trim() || BUDGET_EXHAUSTED_TEXT, actions };
}

async function structured<T>(req: StructuredRequest): Promise<T> {
  // AKIŞLA alınır (sohbetle aynı kanıtlanmış yol): akışsız istek telefonda
  // cevap tamamlanana dek dakikalarca tek bayt almadan bekler ve mobil
  // ağlarda bu sessiz bağlantı koparılır — müfredat/okuma üretimi tam da
  // böyle patlıyordu. Akışta baytlar sürekli aktığı için bağlantı yaşar.
  const stream = client(req.apiKey).messages.stream({
    model: req.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: req.system,
    output_config: { format: { type: "json_schema", schema: req.schema } },
    messages: [{ role: "user", content: req.userMessage }],
  });
  const response = await stream.finalMessage();
  void recordUsage({
    model: req.model,
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
  });
  if (response.stop_reason === "refusal") throw new Error(REFUSAL_TEXT);
  if (response.stop_reason === "max_tokens") throw new Error(TRUNCATED_TEXT);
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error(EMPTY_TEXT);
  return parseStructuredJson<T>(text);
}

export const anthropicProvider: Provider = { meta, chat, structured };
