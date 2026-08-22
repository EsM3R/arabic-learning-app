import Anthropic from "@anthropic-ai/sdk";
import { AgentContext, executeTool, TEACHER_TOOLS } from "./agent";
import { ASSESSMENT_ANALYSIS_SYSTEM, curriculumSystem, pronunciationSystem } from "./prompts";
import {
  Assessment,
  ChatMessage,
  Curriculum,
  CurriculumModule,
  PronunciationItem,
  PronunciationSet,
} from "./types";

const MODEL = "claude-opus-5";

function client(apiKey: string): Anthropic {
  // Kişisel uygulama: anahtar kullanıcının kendi cihazında saklanır ve
  // istekler doğrudan cihazdan Anthropic'e gider.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function extractText(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") {
    throw new Error(
      "Model bu isteği güvenlik nedeniyle yanıtlamadı. Lütfen mesajı değiştirip tekrar deneyin."
    );
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("Modelden boş yanıt geldi, lütfen tekrar deneyin.");
  return text;
}

export interface AgenticReply {
  text: string;
  /** Üstaz'ın bu turda yaptığı eylemlerin UI özetleri. */
  actions: string[];
}

/**
 * Sistem promptu iki parça: stable (ders boyunca değişmez → önbelleklenir)
 * ve dynamic (hafıza/tekrar özeti — her turda tazelenir). Önbellek ön-ek
 * eşleşmesiyle çalıştığı için değişken kısmı sona koymak, araç tanımları +
 * sabit prompt maliyetini her çağrıda ~%90 düşürür. Kaliteye etkisi sıfırdır.
 */
export interface SystemPrompt {
  stable: string;
  dynamic?: string;
}

function systemBlocks(system: SystemPrompt): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: system.stable, cache_control: { type: "ephemeral" } },
  ];
  if (system.dynamic && system.dynamic.trim()) {
    blocks.push({ type: "text", text: system.dynamic });
  }
  return blocks;
}

/** Araç listesinin son elemanına önbellek işareti koyar (araçlar sabittir). */
function cachedTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  return tools.map((t, i) =>
    i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t
  );
}

const MAX_TOOL_ROUNDS = 12;
/** Bu kadar tur kalınca modele "toparla" uyarısı iletilir. */
const WRAP_UP_AT = 3;

/**
 * Agentic sohbet turu: Üstaz cevap verirken araçlarını kendi kararıyla kullanır —
 * önce okuma araçlarıyla (tekrar_durumu, kelime_ara, hafiza_oku, mufredat_oku)
 * duruma bakar, sonra yazma ve inisiyatif araçlarını çağırır. Araç çağrıları
 * burada çalıştırılıp sonuçları modele geri beslenir; model araç istemeyi
 * bırakana kadar döngü sürer. Bütçe dolarsa tur çöpe atılmaz: modelin o ana
 * kadar yazdığı metin döndürülür (araç etkileri zaten diske işlenmiştir).
 */
export async function agenticChat(
  system: string | SystemPrompt,
  messages: ChatMessage[],
  ctx: AgentContext,
  tools: Anthropic.Tool[] = TEACHER_TOOLS,
  maxRounds: number = MAX_TOOL_ROUNDS
): Promise<AgenticReply> {
  const anthropic = client(ctx.profile.apiKey);
  const sys: SystemPrompt = typeof system === "string" ? { stable: system } : system;
  const toolsWithCache = cachedTools(tools);
  const history: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const actions: string[] = [];
  let lastText = "";

  for (let round = 0; round < maxRounds; round++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: systemBlocks(sys),
      tools: toolsWithCache,
      messages: history,
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        "Model bu isteği güvenlik nedeniyle yanıtlamadı. Lütfen mesajı değiştirip tekrar deneyin."
      );
    }

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
      if (!text) throw new Error("Modelden boş yanıt geldi, lütfen tekrar deneyin.");
      return { text, actions };
    }

    // Araç çağrılarını çalıştır; thinking blokları dahil içeriği aynen geri ver
    history.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ContentBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const outcome = await executeTool(
        block.name,
        block.input as Record<string, unknown>,
        ctx
      );
      if (outcome.summary) actions.push(outcome.summary);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: outcome.result,
      });
    }

    // Bütçe tükenmek üzereyse modeli kendi turunu kapatmaya yönlendir —
    // sert kesip turu çöpe atmak yerine düzgün bitirmesini sağlar.
    const remaining = maxRounds - round - 1;
    if (remaining <= WRAP_UP_AT) {
      toolResults.push({
        type: "text",
        text: `[Sistem: bu tur için ${remaining} araç turun kaldı. Kalan araç çağrılarını en gerekliyle sınırla ve öğrenciye dönük cevabını şimdi yaz.]`,
      });
    }

    history.push({ role: "user", content: toolResults });
  }

  // Bütçe bitti: turu çöpe atma. Ne yazdıysa onu döndür, eylemler zaten kaydedildi.
  return {
    text:
      lastText ||
      "Bu turda çok fazla işlem yaptım ve cevabımı yetiştiremedim. Kaldığımız yerden devam edelim — tekrar yazar mısın?",
    actions,
  };
}

const ASSESSMENT_SCHEMA = {
  type: "object",
  properties: {
    speakingLevel: { type: "string", enum: ["A0", "A1", "A2", "B1", "B2", "C1", "C2"] },
    readingLevel: { type: "string", enum: ["A0", "A1", "A2", "B1", "B2", "C1", "C2"] },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["speakingLevel", "readingLevel", "strengths", "weaknesses", "summary"],
  additionalProperties: false,
} as const;

/** Değerlendirme sohbet dökümünden yapılandırılmış seviye raporu üretir. */
export async function analyzeAssessment(
  apiKey: string,
  transcript: ChatMessage[]
): Promise<Assessment> {
  const transcriptText = transcript
    .map((m) => `${m.role === "user" ? "ÖĞRENCİ" : "ÖĞRETMEN"}: ${m.content}`)
    .join("\n\n");
  const response = await client(apiKey).messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: ASSESSMENT_ANALYSIS_SYSTEM,
    output_config: { format: { type: "json_schema", schema: ASSESSMENT_SCHEMA } },
    messages: [{ role: "user", content: `Sohbet dökümü:\n\n${transcriptText}` }],
  });
  return JSON.parse(extractText(response)) as Assessment;
}

const CURRICULUM_SCHEMA = {
  type: "object",
  properties: {
    modules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          track: { type: "string", enum: ["konusma", "okuma"] },
          title: { type: "string" },
          description: { type: "string" },
          level: { type: "string" },
          objectives: { type: "array", items: { type: "string" } },
        },
        required: ["id", "track", "title", "description", "level", "objectives"],
        additionalProperties: false,
      },
    },
  },
  required: ["modules"],
  additionalProperties: false,
} as const;

/** Seviye raporuna göre kişisel müfredat üretir. */
export async function generateCurriculum(
  apiKey: string,
  name: string,
  assessment: Assessment
): Promise<Curriculum> {
  const response = await client(apiKey).messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: curriculumSystem(name, assessment),
    output_config: { format: { type: "json_schema", schema: CURRICULUM_SCHEMA } },
    messages: [{ role: "user", content: "Müfredatımı hazırla lütfen." }],
  });
  const parsed = JSON.parse(extractText(response)) as { modules: CurriculumModule[] };
  return { modules: parsed.modules, generatedAt: new Date().toISOString() };
}

const PRONUNCIATION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arabic: { type: "string" },
          transliteration: { type: "string" },
          turkish: { type: "string" },
          tip: { type: "string" },
        },
        required: ["arabic", "transliteration", "turkish", "tip"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** Seviyeye ve kelime defterine göre telaffuz pratik seti üretir. */
export async function generatePronunciationSet(
  apiKey: string,
  name: string,
  assessment: Assessment | undefined,
  vocabWords: string[],
  strugglingWords: string[] = []
): Promise<PronunciationSet> {
  const response = await client(apiKey).messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: pronunciationSystem(name, assessment, vocabWords, strugglingWords),
    output_config: { format: { type: "json_schema", schema: PRONUNCIATION_SCHEMA } },
    messages: [{ role: "user", content: "Telaffuz pratik setimi hazırla lütfen." }],
  });
  const parsed = JSON.parse(extractText(response)) as { items: PronunciationItem[] };
  return { items: parsed.items, createdAt: new Date().toISOString() };
}
