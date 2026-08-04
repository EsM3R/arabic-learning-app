import Anthropic from "@anthropic-ai/sdk";
import { AgentContext, executeTool, TEACHER_TOOLS } from "./agent";
import { ASSESSMENT_ANALYSIS_SYSTEM, curriculumSystem } from "./prompts";
import { Assessment, ChatMessage, Curriculum, CurriculumModule } from "./types";

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

/** Sohbet turu: sistem promptu + geçmiş → öğretmenin cevabı. */
export async function chatReply(
  apiKey: string,
  system: string,
  messages: ChatMessage[]
): Promise<string> {
  const response = await client(apiKey).messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return extractText(response);
}

export interface AgenticReply {
  text: string;
  /** Üstaz'ın bu turda yaptığı eylemlerin UI özetleri. */
  actions: string[];
}

/**
 * Agentic sohbet turu: Üstaz cevap verirken araçlarını (kelime_kaydet,
 * hata_kaydet, not_yaz, seviye_guncelle, modul_ekle, modul_tamamla)
 * kendi kararıyla kullanır. Araç çağrıları burada çalıştırılıp sonuçları
 * modele geri beslenir; model araç istemeyi bırakana kadar döngü sürer.
 */
export async function agenticChat(
  system: string,
  messages: ChatMessage[],
  ctx: AgentContext
): Promise<AgenticReply> {
  const anthropic = client(ctx.profile.apiKey);
  const history: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const actions: string[] = [];

  for (let turn = 0; turn < 8; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system,
      tools: TEACHER_TOOLS,
      messages: history,
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        "Model bu isteği güvenlik nedeniyle yanıtlamadı. Lütfen mesajı değiştirip tekrar deneyin."
      );
    }

    // Sunucu tarafı araç döngüsü duraklarsa aynı geçmişle devam et
    if (response.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("Modelden boş yanıt geldi, lütfen tekrar deneyin.");
      return { text, actions };
    }

    // Araç çağrılarını çalıştır; thinking blokları dahil içeriği aynen geri ver
    history.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
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
    history.push({ role: "user", content: toolResults });
  }

  throw new Error("Araç döngüsü beklenenden uzun sürdü, lütfen tekrar deneyin.");
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
