import { AgentContext, executeTool, TEACHER_TOOLS } from "./agent";
import { BudgetExceededError, budgetStatus, normalizeLimits } from "./budget";
import { normalizePronunciationItems, sanitizeMinimalPairs } from "./hvpt";
import { getActivePack } from "./languages";
import {
  activeSetup,
  Effort,
  keyFor,
  modelFor,
  PROVIDERS,
  ProviderId,
  StreamHooks,
  ToolSpec,
} from "./providers";
import {
  classifyError,
  successResult,
  TEST_PROMPT,
  TEST_TIMEOUT_MS,
  validateBeforeCall,
} from "./connectiontest";
import type { TestResult } from "./connectiontest";
import {
  curriculumSystem,
  debriefSystem,
  debriefUserMessage,
  pronunciationSystem,
  readingTextSystem,
  sentenceBuildSystem,
  readingTextUserMessage,
} from "./prompts";
import { normalizeDebrief } from "./conversation";
import { normalizeBuildSet } from "./sentencebuilding";
import type { BuildSet, Pattern, Theme } from "./sentencebuilding";
import type { Debrief, Scenario } from "./conversation";
import {
  buildReadingRequest,
  finalizeReading,
  normalizeReadingPayload,
  ReadingOptions,
  topicFromModule,
} from "./reading";
import { normalizeCurriculumModules } from "./structparse";
import { USD_TRY, usageSummary } from "./usage";
import {
  Assessment,
  ChatMessage,
  Curriculum,
  CurriculumModule,
  Profile,
  MinimalPairItem,
  PronunciationItem,
  PronunciationSet,
  ReadingGenPayload,
  ReadingText,
  VocabCard,
} from "./types";

export type { Effort } from "./providers";

/**
 * Sistem promptu iki parça: stable (ders boyunca değişmez → önbelleklenir)
 * ve dynamic (hafıza/tekrar özeti — her turda tazelenir). Önbellek ön-ek
 * eşleşmesiyle çalıştığı için değişken kısım mesajların sonuna konur.
 */
export interface SystemPrompt {
  stable: string;
  dynamic?: string;
}

export interface AgenticReply {
  text: string;
  /** Hocanın bu turda yaptığı eylemlerin UI özetleri. */
  actions: string[];
}

export interface ChatOptions {
  tools?: ToolSpec[];
  maxRounds?: number;
  effort?: Effort;
  /** Canlı akış kancaları — veren ekran cevabı damla damla alır. */
  hooks?: StreamHooks;
}

const MAX_TOOL_ROUNDS = 12;

/**
 * Harcama tavanı bekçisi — para harcayan HER çağrının önünde durur.
 *
 * Tek yerde toplanmasının sebebi şu: ekran ekran kontrol konsaydı, sonradan
 * eklenen bir çağrı yolu sessizce tavansız kalırdı ve bunu kimse fark etmezdi
 * (fatura gelene kadar). Burada olunca yeni bir çağrı yolu eklemek, bekçiyi
 * atlamak için ayrıca uğraşmayı gerektirir.
 *
 * Sınama çağrısı (testConnection) bilerek dışarıda: tek turluk, araçsız ve
 * birkaç token'lık bir istek — üstelik "neden çalışmıyor" sorusunun cevabını
 * bulmanın tek yolu. Tavan dolduğunda teşhis aracını da kapatmak, kullanıcıyı
 * karanlıkta bırakırdı.
 */
async function guardBudget(profile: Profile): Promise<void> {
  let spent;
  try {
    spent = await usageSummary();
  } catch {
    // Sayacı okuyamadıysak dersi KESMEYİZ. Bekçinin işi harcamayı durdurmak;
    // depo arızasında öğrenciyi çalışmaktan alıkoymak koruma değil zarardır.
    return;
  }
  const status = budgetStatus(spent, normalizeLimits(profile.budget), USD_TRY);
  if (status.state === "blocked") throw new BudgetExceededError(status);
}

function requireKey(profile: Profile): ReturnType<typeof activeSetup> {
  const setup = activeSetup(profile);
  if (!setup.apiKey.trim()) {
    throw new Error(
      `${setup.provider.meta.label} için API anahtarı girilmemiş. Panelden ⋯ → Ayarlar ekranından ekleyebilirsin.`
    );
  }
  return setup;
}

/**
 * Agentic sohbet turu: hoca cevap verirken araçlarını kendi kararıyla kullanır.
 * Araç çağrıları burada çalıştırılıp sonuçları modele geri beslenir; model
 * araç istemeyi bırakana kadar döngü sürer. Hangi sağlayıcının kullanılacağı
 * profildeki seçime göre belirlenir — döngünün mantığı sağlayıcı modülünde.
 */
export async function agenticChat(
  system: string | SystemPrompt,
  messages: ChatMessage[],
  ctx: AgentContext,
  opts: ChatOptions = {}
): Promise<AgenticReply> {
  const { tools = TEACHER_TOOLS, maxRounds = MAX_TOOL_ROUNDS, effort = "high" } = opts;
  const sys: SystemPrompt = typeof system === "string" ? { stable: system } : system;
  await guardBudget(ctx.profile);
  const { provider, model, apiKey } = requireKey(ctx.profile);

  return provider.chat({
    stable: sys.stable,
    dynamic: sys.dynamic,
    messages,
    tools: tools as ToolSpec[],
    maxRounds,
    effort,
    model,
    apiKey,
    runTool: (name, input) => executeTool(name, input, ctx),
    ...opts.hooks,
  });
}

/**
 * Sağlayıcıyı sınar: tek turluk, araçsız, en kısa istek.
 *
 * Bu uygulamada dört sağlayıcı var ama hepsi canlı denenmedi; denenmemiş kod
 * yolu, ders açıldığında uzun bir bekleyişin sonunda patlayan bir sürprizdir.
 * Sınama bunu Ayarlar'a, beş saniyeye çeker.
 *
 * ARAÇSIZ ve TEK TUR: sınanan şey öğretim değil BAĞLANTI. Araç listesi
 * gönderilseydi bir sağlayıcının araç biçimindeki sorunu "bağlantı yok" gibi
 * görünürdü.
 */
export async function testConnection(
  profile: Profile,
  providerId: ProviderId
): Promise<TestResult> {
  const provider = PROVIDERS[providerId];
  const apiKey = keyFor(profile, providerId);
  const model = modelFor(profile, providerId);

  const early = validateBeforeCall(apiKey, provider.meta.keyPrefix);
  if (early) return early;

  // Süre sınırı: sağlayıcı cevap vermezse kullanıcı sonsuza kadar beklemesin.
  // Zamanlayıcı finally'de TEMİZLENİR: yarışı istek kazandığında geride kalan
  // bir zamanlayıcı, iş bitmiş olsa da olay döngüsünü boşuna meşgul tutar.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), TEST_TIMEOUT_MS);
  });
  try {
    const reply = await Promise.race([
      provider.chat({
        stable: "Kısa cevap ver.",
        messages: [{ role: "user", content: TEST_PROMPT }],
        tools: [],
        maxRounds: 1,
        effort: "low",
        model,
        apiKey,
        runTool: async () => ({ result: "" }),
      }),
      timeout,
    ]);
    return successResult(reply.text, model);
  } catch (e) {
    return classifyError(e instanceof Error ? e.message : String(e));
  } finally {
    if (timer) clearTimeout(timer);
  }
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

/** Seviye raporuna göre kişisel müfredat üretir (agentic kurulum başarısız olursa yedek yol). */
export async function generateCurriculum(
  profile: Profile,
  assessment: Assessment,
  observations?: string
): Promise<Curriculum> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const parsed = await provider.structured<{ modules: CurriculumModule[] }>({
    system: curriculumSystem(profile.name, assessment, observations),
    userMessage: "Müfredatımı hazırla lütfen.",
    schema: CURRICULUM_SCHEMA as unknown as Record<string, unknown>,
    model,
    apiKey,
  });
  // Şema uygulamayan sağlayıcıda eksik alan/yanlış parkur gelebilir —
  // cihazda toparlanır; azsa çağıran (panel) "tekrar dene" der.
  return { modules: normalizeCurriculumModules(parsed), generatedAt: new Date().toISOString() };
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
    minimalPairs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          a: {
            type: "object",
            properties: { word: { type: "string" }, translit: { type: "string" } },
            required: ["word", "translit"],
            additionalProperties: false,
          },
          b: {
            type: "object",
            properties: { word: { type: "string" }, translit: { type: "string" } },
            required: ["word", "translit"],
            additionalProperties: false,
          },
          focus: { type: "string" },
          tip: { type: "string" },
          playIndex: { type: "integer", enum: [0, 1] },
        },
        required: ["a", "b", "focus", "tip", "playIndex"],
        additionalProperties: false,
      },
    },
  },
  required: ["items", "minimalPairs"],
  additionalProperties: false,
} as const;

const READING_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    titleTr: { type: "string" },
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target: { type: "string" },
          translit: { type: "string" },
          tr: { type: "string" },
        },
        required: ["target", "translit", "tr"],
        additionalProperties: false,
      },
    },
    newWords: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          translit: { type: "string" },
          tr: { type: "string" },
          hint: { type: "string" },
        },
        required: ["word", "translit", "tr", "hint"],
        additionalProperties: false,
      },
    },
    usedReviewWords: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          q: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
          answer: { type: "integer" },
        },
        required: ["q", "choices", "answer"],
        additionalProperties: false,
      },
    },
    productionTask: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        example: { type: "string" },
      },
      required: ["instruction", "example"],
      additionalProperties: false,
    },
  },
  required: [
    "title",
    "titleTr",
    "sentences",
    "newWords",
    "usedReviewWords",
    "questions",
    "productionTask",
  ],
  additionalProperties: false,
} as const;

/**
 * Kelime defterinden %96-98 kapsamlı okuma metni — TEK yapılandırılmış çağrı.
 * Kapsam ölçümü ve kart eşleme cihazda (src/reading.ts + src/textnorm.ts).
 */
export async function generateReadingText(
  profile: Profile,
  vocab: VocabCard[],
  opts: ReadingOptions
): Promise<ReadingText> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const pack = getActivePack();
  const level = profile.assessment?.readingLevel ?? "A1";
  const module = opts.moduleId
    ? profile.curriculum?.modules.find((m) => m.id === opts.moduleId)
    : undefined;
  const req = buildReadingRequest(
    vocab,
    opts,
    level,
    module ? topicFromModule(module) : undefined,
    pack.scenarios,
    pack.diglossic
  );
  const raw = await provider.structured<ReadingGenPayload>({
    system: readingTextSystem(profile.name, req, opts.avoidWords),
    userMessage: readingTextUserMessage(req),
    schema: READING_SCHEMA as unknown as Record<string, unknown>,
    model,
    apiKey,
  });
  const reading = finalizeReading(normalizeReadingPayload(raw), req, vocab, pack.script);
  if (reading.sentences.length === 0) {
    throw new Error(
      "Modelin cevabında hiç cümle yoktu (şemaya uymamış). Tekrar denemek genelde çözer."
    );
  }
  return reading;
}

/** Seviyeye ve kelime defterine göre telaffuz pratik seti üretir. */
export async function generatePronunciationSet(
  profile: Profile,
  vocabWords: string[],
  strugglingWords: string[] = []
): Promise<PronunciationSet> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const parsed = await provider.structured<{
    items: PronunciationItem[];
    minimalPairs: MinimalPairItem[];
  }>({
    system: pronunciationSystem(
      profile.name,
      profile.assessment,
      vocabWords,
      strugglingWords
    ),
    userMessage: "Telaffuz pratik setimi hazırla lütfen.",
    schema: PRONUNCIATION_SCHEMA as unknown as Record<string, unknown>,
    model,
    apiKey,
  });
  const items = normalizePronunciationItems(parsed.items);
  if (items.length === 0) {
    throw new Error(
      "Modelin cevabında hiç telaffuz öğesi yoktu (şemaya uymamış). Tekrar denemek genelde çözer."
    );
  }
  return {
    items,
    minimalPairs: sanitizeMinimalPairs(parsed.minimalPairs ?? [], getActivePack().script),
    createdAt: new Date().toISOString(),
  };
}


const DEBRIEF_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    goalReached: { type: ["boolean", "null"] },
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          said: { type: "string" },
          better: { type: "string" },
          why: { type: "string" },
        },
        required: ["said", "better", "why"],
        additionalProperties: false,
      },
    },
    keep: { type: "array", items: { type: "string" } },
    phrases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target: { type: "string" },
          translit: { type: "string" },
          tr: { type: "string" },
        },
        required: ["target", "translit", "tr"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "goalReached", "corrections", "keep", "phrases"],
  additionalProperties: false,
} as const;

/**
 * Konuşma sonrası değerlendirme — Konuşma Odası'nın ikinci yarısı.
 * Konuşma sırasında bilerek düzeltilmeyen her şey burada tek parça gelir.
 */
export async function generateDebrief(
  profile: Profile,
  scenario: Scenario | null,
  turns: ChatMessage[]
): Promise<Debrief> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const parsed = await provider.structured<unknown>({
    system: debriefSystem(profile, scenario),
    userMessage: debriefUserMessage(
      turns.filter((t): t is ChatMessage & { role: "user" | "assistant" } =>
        t.role === "user" || t.role === "assistant"
      )
    ),
    schema: DEBRIEF_SCHEMA as unknown as Record<string, unknown>,
    model,
    apiKey,
  });
  return normalizeDebrief(parsed);
}

const STEP_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    trPiece: { type: "string" },
    trSoFar: { type: "string" },
    target: { type: "string" },
    alts: { type: "array", items: { type: "string" } },
    translit: { type: "string" },
    note: { type: "string" },
  },
  required: ["question", "trPiece", "trSoFar", "target", "alts", "translit", "note"],
  additionalProperties: false,
} as const;

const BUILD_SET_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tr: { type: "string" },
          steps: { type: "array", items: STEP_SCHEMA },
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                target: { type: "string" },
                tr: { type: "string" },
                note: { type: "string" },
                contrast: { type: "string" },
                alts: { type: "array", items: { type: "string" } },
              },
              required: ["target", "tr", "note", "contrast", "alts"],
              additionalProperties: false,
            },
          },
          reorder: { type: "string" },
        },
        required: ["tr", "steps", "blocks", "reorder"],
        additionalProperties: false,
      },
    },
  },
  required: ["intro", "sentences"],
  additionalProperties: false,
} as const;

/**
 * Cümle kurma seti — tek yapılandırılmış çağrı. Set cihazda saklanır ve
 * tekrar tekrar çalışılır; her açılışta yeniden üretilmez.
 */
export async function generateBuildSet(
  profile: Profile,
  pattern: Pattern,
  theme: Theme,
  knownWords: string[],
  avoid: string[] = []
): Promise<BuildSet> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const parsed = await provider.structured<unknown>({
    system: sentenceBuildSystem(profile, pattern, theme, knownWords, avoid),
    userMessage: "Cümle kurma setimi hazırla.",
    schema: BUILD_SET_SCHEMA as unknown as Record<string, unknown>,
    model,
    apiKey,
  });
  const set = normalizeBuildSet(parsed, pattern.id, theme.id);
  if (set.sentences.length < 3) {
    throw new Error("Set beklenenden kısa geldi (modelin cevabı şemaya uymamış). Tekrar denemek genelde çözer.");
  }
  return set;
}
