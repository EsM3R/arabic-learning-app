import type { Content, FunctionCall, GoogleGenAI, Part } from "@google/genai";
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
 * Google Gemini — generateContent üzerinden.
 *
 * Farklar: sistem promptu ayrı bir alanda (systemInstruction), asistan rolü
 * "model" adını taşıyor, araç sonuçları functionResponse parçası olarak
 * dönüyor. Düşünme derinliği ayarı (thinkingConfig) burada kasten
 * kullanılmadı — modelin kendi varsayılanı bırakıldı.
 */
const meta: ProviderMeta = {
  id: "gemini",
  label: "Google Gemini",
  keyHint: "aistudio.google.com → Get API key",
  keyPrefix: "",
  defaultModel: "gemini-3.7-flash",
  models: ["gemini-3.1-pro", "gemini-3.7-flash"],
  costNote: "3.1 Pro ≈ 42 TL/ders · 3.7 Flash ≈ 15 TL (promosyon)",
  experimental: true,
};

/**
 * SDK yalnızca bu sağlayıcı kullanıldığında yüklenir. Paketin "node" yapısı
 * fs/path/ws istiyor ve React Native'de çalışmaz; bu yüzden önce tarayıcı
 * yapısı denenir.
 */
function client(apiKey: string): GoogleGenAI {
  let mod: any;
  try {
    mod = require("@google/genai/web");
  } catch {
    mod = require("@google/genai");
  }
  const Ctor = mod.GoogleGenAI ?? mod.default?.GoogleGenAI ?? mod.default;
  return new Ctor({ apiKey }) as GoogleGenAI;
}

function toTools(req: AgenticRequest) {
  // Araç yoksa alanın kendisi gönderilmez: Gemini boş functionDeclarations'ı
  // geçersiz sayar (bkz. toolsOrUndefined).
  if (req.tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.input_schema,
      })),
    },
  ];
}

async function chat(req: AgenticRequest): Promise<AgenticReply> {
  const ai = client(req.apiKey);
  const tools = toTools(req);
  const actions: string[] = [];
  // Gemini SDK'sının RN'de güvenilir akışı yok: metin tek parça teslim edilir
  // ama AYNI kancalardan geçer — UI farkı bilmez, sadece damlamaz.
  const textParts: string[] = [];

  const contents: Content[] = req.messages.map((m, i) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      {
        text:
          i === req.messages.length - 1
            ? withDynamic(m.content, req.dynamic)
            : m.content,
      },
    ],
  }));

  for (let round = 0; round < req.maxRounds; round++) {
    req.onRound?.(round);
    const response = await ai.models.generateContent({
      model: req.model,
      contents,
      config: {
        systemInstruction: req.stable,
        tools,
        maxOutputTokens: 16000,
      },
    });

    const gm = response.usageMetadata;
    void recordUsage({
      model: req.model,
      input: gm?.promptTokenCount ?? 0,
      output: gm?.candidatesTokenCount ?? 0,
      cacheRead: gm?.cachedContentTokenCount ?? 0,
    });
    const text = (response.text ?? "").trim();
    if (text) {
      textParts.push(text);
      req.onText?.(text);
    }

    const calls: FunctionCall[] = response.functionCalls ?? [];
    if (calls.length === 0) {
      const full = textParts.join("\n\n").trim();
      if (!full) throw new Error(EMPTY_TEXT);
      return { text: full, actions };
    }

    // Modelin turu (araç çağrıları dahil) geçmişe aynen eklenir
    const modelParts = response.candidates?.[0]?.content?.parts;
    contents.push({
      role: "model",
      parts: modelParts ?? calls.map((c) => ({ functionCall: c })),
    });

    const resultParts: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      req.onTool?.(name);
      const outcome = await req.runTool(
        name,
        (call.args ?? {}) as Record<string, unknown>
      );
      if (outcome.summary) actions.push(outcome.summary);
      resultParts.push({
        functionResponse: {
          id: call.id,
          name,
          response: { result: outcome.result },
        },
      });
    }

    const remaining = req.maxRounds - round - 1;
    if (remaining <= 3) {
      resultParts.push({ text: wrapUpNotice(remaining) });
    }
    contents.push({ role: "user", parts: resultParts });
  }

  return { text: textParts.join("\n\n").trim() || BUDGET_EXHAUSTED_TEXT, actions };
}

async function structured<T>(req: StructuredRequest): Promise<T> {
  const response = await client(req.apiKey).models.generateContent({
    model: req.model,
    contents: [{ role: "user", parts: [{ text: req.userMessage }] }],
    config: {
      systemInstruction: req.system,
      responseMimeType: "application/json",
      responseJsonSchema: req.schema,
      maxOutputTokens: 16000,
    },
  });
  void recordUsage({
    model: req.model,
    input: response.usageMetadata?.promptTokenCount ?? 0,
    output: response.usageMetadata?.candidatesTokenCount ?? 0,
  });
  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new Error(TRUNCATED_TEXT);
  }
  const text = (response.text ?? "").trim();
  if (!text) throw new Error(EMPTY_TEXT);
  return parseStructuredJson<T>(text);
}

export const geminiProvider: Provider = { meta, chat, structured };
