import Anthropic from "@anthropic-ai/sdk";
import { buildMessages, cachedTools, systemBlocks } from "../caching";
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
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
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

async function chat(req: AgenticRequest): Promise<AgenticReply> {
  const anthropic = client(req.apiKey);
  const tools = toTools(req);
  const history = buildMessages(req.messages, req.dynamic);
  const actions: string[] = [];
  let lastText = "";

  for (let round = 0; round < req.maxRounds; round++) {
    const response = await anthropic.messages.create({
      model: req.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: req.effort },
      system: systemBlocks(req.stable),
      tools,
      messages: history,
    });

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
    if (text) lastText = text;

    // Sunucu tarafı araç döngüsü duraklarsa aynı geçmişle devam et
    if (response.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use") {
      if (!text) throw new Error(EMPTY_TEXT);
      return { text, actions };
    }

    // Thinking blokları dahil içeriği aynen geri ver
    history.push({ role: "assistant", content: response.content });
    const results: Anthropic.ContentBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
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

  return { text: lastText || BUDGET_EXHAUSTED_TEXT, actions };
}

async function structured<T>(req: StructuredRequest): Promise<T> {
  const response = await client(req.apiKey).messages.create({
    model: req.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: req.system,
    output_config: { format: { type: "json_schema", schema: req.schema } },
    messages: [{ role: "user", content: req.userMessage }],
  });
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
  if (!text) throw new Error(EMPTY_TEXT);
  return JSON.parse(text) as T;
}

export const anthropicProvider: Provider = { meta, chat, structured };
