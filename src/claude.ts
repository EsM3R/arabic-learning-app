import { EMPTY_TEXT, REFUSAL_TEXT, TRUNCATED_TEXT } from "./providers/types";
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
  buildSentencePrompt,
  curriculumSystem,
  debriefSystem,
  debriefUserMessage,
  askSystem,
  askUser,
  judgeSystem,
  judgeUser,
  storyEvalSystem,
  storyEvalUser,
  moreTransferSystem,
  probeSystem,
  pronunciationSystem,
  readingTextSystem,
  sentenceBuildSystem,
  sentencePlanSystem,
  sentencePlanUser,
  readingTextUserMessage,
} from "./prompts";
import type { AskInput, JudgeInput, PlanPromptInput, StoryEvalInput } from "./prompts";
import { normalizeDebrief } from "./conversation";
import { deriveSwaps } from "./buildcheck";
import { normalizeBuildSet, normalizeSentence, validatePlan } from "./sentencebuilding";
import type {
  Band,
  BuildSentence,
  BuildSet as BuildSetV2,
  BuildSetV1 as BuildSet,
  NormalizeStores,
  Pattern,
  Swap,
  Theme,
  ValidatedPlan,
} from "./sentencebuilding";
import type { LanguageId } from "./languages";
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
export async function guardBudget(profile: Profile): Promise<void> {
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

/** @deprecated v1 tek çağrılık set şeması (generateBuildSet ile birlikte gider). */
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
 *
 * @deprecated v1 yolu: ekran kart sırasına geçene kadar (faz 4) duruyor.
 * Yeni üretim plan + cümle cümle: generateBuildPlan / generateBuildSentence,
 * düzenleyen src/buildpipeline.ts.
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
  /**
   * Düşünen modeller (DeepSeek) düşünmeyi de cevap sınırından harcıyor:
   * uzun bir set yarıda kesilebiliyor. Kesilirse KISA bir setle bir kez
   * daha denenir — öğrenciye "tekrar dene" demek yerine işi uygulama yapar.
   */
  const ask = (count: string) =>
    provider.structured<unknown>({
      system: sentenceBuildSystem(profile, pattern, theme, knownWords, avoid, count),
      userMessage: "Cümle kurma setimi hazırla.",
      schema: BUILD_SET_SCHEMA as unknown as Record<string, unknown>,
      model,
      apiKey,
    });
  let parsed: unknown;
  try {
    parsed = await ask("5-6");
  } catch (e) {
    if (!(e instanceof Error) || e.message !== TRUNCATED_TEXT) throw e;
    await guardBudget(profile);
    try {
      parsed = await ask("3-4");
    } catch (e2) {
      if (e2 instanceof Error && e2.message === TRUNCATED_TEXT) {
        throw new Error(
          "Model iki denemede de cevabı bitiremedi (kısaltılmış setle bile). Ayarlar'dan başka bir modele geçmeyi ya da biraz sonra tekrar denemeyi dene."
        );
      }
      throw e2;
    }
  }
  const set = normalizeBuildSet(parsed, pattern.id, theme.id);
  if (set.sentences.length < 3) {
    throw new Error("Set beklenenden kısa geldi (modelin cevabı şemaya uymamış). Tekrar denemek genelde çözer.");
  }
  return set;
}

// ---------------------------------------------------------------------------
// CÜMLE KURMA v3 — plan + cümle cümle üretim (tasarım §2)
// ---------------------------------------------------------------------------

/**
 * Şemalar sağlayıcıya olduğu gibi gider (Anthropic/OpenAI/Gemini şemayı
 * uygular). DeepSeek şema uygulamaz, şemayı sistem promptuna metin olarak
 * ekler — tam JSON Schema orada her istekte ~1-2 bin karakter yer ve hiçbir
 * işe yaramaz; onun yerine aşağıdaki kısa ipuçları (schemaHint) gider.
 * Her nesnede `additionalProperties: false` şart: Anthropic yapılandırılmış
 * çıktısı onsuz şemayı 400 ile geri çevirir; bu hata model hatası sayılmadığı
 * için denenmez ve cümle sonsuza dek "pending" kalırdı.
 */
export const PLAN_SCHEMA = {
  type: "object",
  required: ["intro", "s"],
  properties: {
    intro: { type: "string" },
    ozet: { type: "string" },
    tense: { type: "string", enum: ["habit", "now", "past", "future", "mixed"] },
    s: {
      type: "array",
      items: {
        type: "object",
        required: ["tr", "r", "new"],
        properties: {
          tr: { type: "string" },
          r: { type: "string", enum: ["open", "build", "peak", "dip", "extension", "synthesis"] },
          conn: {
            type: "object",
            required: ["k", "tr", "t"],
            properties: {
              k: { type: "string", enum: ["sub", "coord", "causal"] },
              tr: { type: "string" },
              t: { type: "string" },
              p1: { type: "string" },
              p2: { type: "string" },
            },
            additionalProperties: false,
          },
          new: { type: "array", items: { type: "string" } },
          rec: { type: "array", items: { type: "string" } },
          focus: { type: "boolean" },
          fn: { type: "boolean" },
          sys: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export const PLAN_SCHEMA_HINT =
  "{intro,ozet?,tense?,s:[{tr,r,conn?{k,tr,t,p1,p2},new[],rec?[],focus?,fn?,sys?}]}";

const PAIR_SCHEMA = {
  type: "object",
  properties: { t: { type: "string" }, tr: { type: "string" } },
  additionalProperties: false,
} as const;

export const SENTENCE_SCHEMA = {
  type: "object",
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["p", "t"],
        properties: {
          q: { type: "string" },
          p: { type: "string" },
          t: { type: "string" },
          n: { type: "string" },
          e: { type: "integer" },
          tx: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    blocks: {
      type: "array",
      items: {
        type: "object",
        required: ["t", "tr", "k", "s"],
        properties: {
          t: { type: "string" },
          tr: { type: "string" },
          k: { type: "string" },
          s: { type: "integer" },
          n: { type: "string" },
          c: { type: "string" },
          a: { type: "array", items: { type: "string" } },
          pair: PAIR_SCHEMA,
          x: PAIR_SCHEMA,
        },
        additionalProperties: false,
      },
    },
    sw: { type: "array", items: { type: "array", items: { type: "string" } } },
    cc: { type: "string" },
    reorder: { type: "string" },
    tw: { type: "array", items: { type: "string" } },
    rtl: { type: "string" },
    sd: { type: "integer" },
    ret: {
      type: "object",
      properties: {
        s: { type: "integer" },
        q: { type: "string" },
        o: { type: "array", items: { type: "string" } },
        a: { type: "integer" },
        w: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

export const SENTENCE_SCHEMA_HINT =
  "{steps:[{q?,p,t,n?,e?,tx?}],blocks?[{t,tr,k,s,n?,c?,a?,pair?{t,tr},x?{t,tr}}],sw?,cc?,reorder?,tw?,rtl?,sd?,ret?{s,q,o[2],a,w}}";

export const PROBE_SCHEMA = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["pid", "tr", "t"],
        properties: {
          pid: { type: "string" },
          tr: { type: "string" },
          t: { type: "string" },
          sw: { type: "array", items: { type: "array", items: { type: "string" } } },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export const PROBE_SCHEMA_HINT = "{items:[{pid,tr,t,sw?[[kanonik,alternatif]]}]}";

export const MORE_TRANSFER_SCHEMA = {
  type: "object",
  required: ["x"],
  properties: { x: { type: "array", items: { type: "array", items: { type: "string" } } } },
  additionalProperties: false,
} as const;

export const MORE_TRANSFER_SCHEMA_HINT = "{x:[[t,tr]]}";

/** Setin en küçük boyu: açılış, kurma, zirve, çukur, uzatma ve sentez. */
export const MIN_SET_SIZE = 6;

const PLAN_INVALID_PREFIX = "Set planı eksik geldi";

/**
 * Model çıktısının kendisinden doğan hata mı (kesildi, boş, bozuk JSON,
 * geri çevrildi)? Bunlar KISA MOD / KISA DÜŞÜN ile bir kez daha denenir,
 * olmazsa cümle "failed" olur; ağ, anahtar ve harcama tavanı hataları
 * denenmez — cümle bekler, bağlantı gelince kaldığı yerden sürer.
 */
export function isModelOutputError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.message === TRUNCATED_TEXT ||
    e.message === EMPTY_TEXT ||
    e.message === REFUSAL_TEXT ||
    e.message.startsWith("Model geçerli JSON döndürmedi") ||
    e.message.startsWith(PLAN_INVALID_PREFIX)
  );
}

export interface BuildPlanResult extends ValidatedPlan {
  /** Planın gerçekten istendiği cümle sayısı (ikinci başarısızlıkta n-1). */
  n: number;
}

/**
 * Set PLANI (tasarım §2.1). Kesilir ya da eksik gelirse önce AYNI n ile
 * "KISA DÜŞÜN" denenir — setin yükünü düşürmek son çare; ancak ikinci
 * başarısızlıkta bir cümle eksiltilir (en az 6: çukur, uzatma ve sentez her
 * sette kalsın). Roller zaten konumdan yeniden hesaplanır (arcRoles).
 * Tarihçedeki cümlelerden birden fazlası tekrar gelirse o listeyle BİR kez
 * yeniden istenir.
 */
export async function generateBuildPlan(
  profile: Profile,
  input: PlanPromptInput & { trKeys?: string[] }
): Promise<BuildPlanResult> {
  const { provider, model, apiKey } = requireKey(profile);
  const attempts: { n: number; short: boolean }[] = [
    { n: input.n, short: false },
    { n: input.n, short: true },
    { n: Math.max(MIN_SET_SIZE, input.n - 1), short: true },
  ];
  const minOk = Math.min(MIN_SET_SIZE, input.n);
  const ask = async (n: number, short: boolean, avoidTr?: string[]) => {
    await guardBudget(profile);
    const raw = await provider.structured<unknown>({
      system: sentencePlanSystem({ ...input, n }),
      userMessage: sentencePlanUser({ short, avoidTr }),
      schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      schemaHint: PLAN_SCHEMA_HINT,
      model,
      apiKey,
    });
    return validatePlan(raw, n, { lang: input.lang, band: input.band, tense: input.tense ?? input.theme.tense, trKeys: input.trKeys });
  };
  let replanned = false;
  let last: unknown = null;
  for (const at of attempts) {
    try {
      let v = await ask(at.n, at.short);
      if (v.replan && !replanned) {
        replanned = true;
        v = await ask(at.n, at.short, v.dropped);
      }
      if (v.plan.sentences.length >= Math.min(minOk, at.n)) return { ...v, n: at.n };
      last = new Error(`${PLAN_INVALID_PREFIX} (${v.plan.sentences.length}/${at.n} cümle).`);
    } catch (e) {
      if (!isModelOutputError(e)) throw e;
      last = e;
    }
  }
  const why = last instanceof Error && last.message === TRUNCATED_TEXT ? "cevabı bitiremedi" : "düzgün bir plan vermedi";
  throw new Error(
    `Model üç denemede de set planını hazırlayamadı (${why}). Ayarlar'dan başka bir modele geçmeyi ya da biraz sonra tekrar denemeyi dene.`
  );
}

export interface BuildSentenceInput {
  set: BuildSetV2;
  k: number;
  stores: NormalizeStores;
  /** Üretilemeyen cümleden bu cümleye taşınan yeni taşlar. */
  carry?: string[];
  contrastShown?: string[];
  videoOrder?: boolean;
}

/**
 * Setin k. cümlesi — TEK istek, cihazda toparlanmış hâliyle döner. Sistem
 * promptu set boyunca sabittir (önbellek); KISA MOD kullanıcı mesajına
 * girer. Kesilme hatası olduğu gibi fırlatılır; kaç kez deneneceğine
 * üretim hattı (src/buildpipeline.ts) karar verir. 2'den az kullanılabilir
 * adım gelirse cümle "failed" döner — o da hattın yeniden deneme işaretidir.
 */
export async function generateBuildSentence(
  profile: Profile,
  input: BuildSentenceInput,
  short = false,
  budgetChecked = false
): Promise<BuildSentence> {
  // Tavan set başına BİR kez bakılır (tasarım §2.1): hat, çalıştırma başında
  // bakıp budgetChecked verir. Cümle başına bakılsaydı tavan set ortasında
  // dolduğunda öğrenci parası ödenmiş yarım bir setle kalırdı.
  if (!budgetChecked) await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const { system, userMessage } = buildSentencePrompt(input.set, input.k, {
    carry: input.carry,
    contrastShown: input.contrastShown,
    videoOrder: input.videoOrder,
    short,
  });
  const raw = await provider.structured<unknown>({
    system,
    userMessage,
    schema: SENTENCE_SCHEMA as unknown as Record<string, unknown>,
    schemaHint: SENTENCE_SCHEMA_HINT,
    model,
    apiKey,
  });
  return normalizeSentence(raw, input.set.plan, input.k, input.set.sentences, input.set.lang, input.stores);
}

export interface ProbeItem {
  pid: string;
  tr: string;
  target: string;
  swaps: Swap[];
}

/**
 * Yerleştirme yoklaması: en fazla 8 kalıp × 2-4 cümle, tek istek. Kalıp
 * kimliği tanınmayan ya da boş gelen öğe atılır; hiç öğe kalmazsa hata.
 */
export async function generateProbe(
  profile: Profile,
  patterns: Pattern[],
  opts: { lang: LanguageId; band: Band; perPattern?: number }
): Promise<ProbeItem[]> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const list = patterns.slice(0, 8);
  const per = Math.max(2, Math.min(4, opts.perPattern ?? 2));
  const raw = await provider.structured<{ items?: unknown }>({
    system: probeSystem({ lang: opts.lang, band: opts.band, patterns: list, perPattern: per }),
    userMessage: "Yoklamamı hazırla.",
    schema: PROBE_SCHEMA as unknown as Record<string, unknown>,
    schemaHint: PROBE_SCHEMA_HINT,
    model,
    apiKey,
  });
  const ids = new Set(list.map((p) => p.id));
  const count: Record<string, number> = {};
  const items: ProbeItem[] = [];
  for (const x of Array.isArray(raw?.items) ? raw.items : []) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const pid = typeof o.pid === "string" ? o.pid.trim() : "";
    const tr = typeof o.tr === "string" ? o.tr.trim() : "";
    const target = typeof o.t === "string" ? o.t.trim() : "";
    if (!ids.has(pid) || !tr || !target) continue;
    if ((count[pid] ?? 0) >= 4) continue;
    count[pid] = (count[pid] ?? 0) + 1;
    const sw = (Array.isArray(o.sw) ? o.sw : []).filter(
      (p): p is string[] => Array.isArray(p) && p.length >= 2 && p.every((y) => typeof y === "string")
    );
    items.push({ pid, tr, target, swaps: deriveSwaps(target, { sw: sw.map((p) => [p[0], p[1]] as [string, string]) }, opts.lang) });
  }
  if (items.length === 0) {
    throw new Error("Yoklama boş geldi (modelin cevabı şemaya uymamış). Tekrar denemek genelde çözer.");
  }
  return items;
}

/**
 * "Başka örnek": öğrenilmiş bir taşı yeni dolguyla kullanan 3 kısa cümle.
 * Örnek sınırı yok (her basışta yeni istek) ama set ağırlaşmaz.
 */
export async function generateMoreTransfer(
  profile: Profile,
  block: { target: string; tr: string; note?: string },
  opts: { lang: LanguageId; band: Band; avoid?: string[] }
): Promise<{ target: string; tr: string }[]> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const raw = await provider.structured<{ x?: unknown }>({
    system: moreTransferSystem({ lang: opts.lang, band: opts.band, block, avoid: opts.avoid }),
    userMessage: "Başka örnek ver.",
    schema: MORE_TRANSFER_SCHEMA as unknown as Record<string, unknown>,
    schemaHint: MORE_TRANSFER_SCHEMA_HINT,
    model,
    apiKey,
  });
  const avoid = new Set((opts.avoid ?? []).map((a) => a.trim().toLowerCase()));
  const out: { target: string; tr: string }[] = [];
  for (const x of Array.isArray(raw?.x) ? raw.x : []) {
    if (!Array.isArray(x) || typeof x[0] !== "string" || typeof x[1] !== "string") continue;
    const target = x[0].trim();
    const tr = x[1].trim();
    if (!target || !tr || avoid.has(target.toLowerCase())) continue;
    out.push({ target, tr });
    if (out.length >= 3) break;
  }
  if (out.length === 0) {
    throw new Error("Yeni örnek gelmedi (modelin cevabı şemaya uymamış). Tekrar denemek genelde çözer.");
  }
  return out;
}

export const JUDGE_SCHEMA = {
  type: "object",
  required: ["ok", "why"],
  properties: { ok: { type: "boolean" }, why: { type: "string" } },
  additionalProperties: false,
} as const;

export const JUDGE_SCHEMA_HINT = "{ok:boolean,why}";

/**
 * Hocaya danış: cihazdaki denetleyicinin "olmadı" dediği cevap gerçekten
 * yanlış mı? Aklına gelmeyen doğru bir söyleyişi kabul ettirir; yanlışsa
 * NEDEN yanlış olduğunu hocanın diliyle anlatır.
 */
export async function judgeBuildAnswer(profile: Profile, input: JudgeInput): Promise<{ ok: boolean; why: string }> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const raw = await provider.structured<{ ok?: unknown; why?: unknown }>({
    system: judgeSystem(input),
    userMessage: judgeUser(input),
    schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
    schemaHint: JUDGE_SCHEMA_HINT,
    model,
    apiKey,
  });
  if (typeof raw?.ok !== "boolean") {
    throw new Error("Hocanın cevabı anlaşılamadı (modelin cevabı şemaya uymamış).");
  }
  return { ok: raw.ok, why: typeof raw.why === "string" ? raw.why.trim() : "" };
}

export const ASK_SCHEMA = {
  type: "object",
  required: ["a"],
  properties: { a: { type: "string" } },
  additionalProperties: false,
} as const;

export const ASK_SCHEMA_HINT = '{"a":"öğrenciye Türkçe cevabın tamamı (tek metin)"}';

/**
 * Modelin cevabından metni çıkarır. Şemayı uygulamayan sağlayıcı (DeepSeek)
 * bazen alanı başka adla yazar ({"cevap": …}, {"answer": …}) ya da metni
 * iç içe koyar; o yüzden "a" yoksa en uzun metin alanı alınır.
 */
export function pickAnswerText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  if (typeof o.a === "string" && o.a.trim()) return o.a.trim();
  let best = "";
  for (const v of Object.values(o)) {
    const t = typeof v === "string" ? v.trim() : Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n").trim() : pickAnswerText(v);
    if (t.length > best.length) best = t;
  }
  return best;
}

/** "Hocaya sor": çalışılan cümle hakkında serbest soru, hocanın üslubuyla cevap. */
export async function askBuildTeacher(profile: Profile, input: AskInput, question: string): Promise<string> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const once = async () =>
    pickAnswerText(
      await provider.structured<unknown>({
        system: askSystem(input),
        userMessage: askUser(input, question),
        schema: ASK_SCHEMA as unknown as Record<string, unknown>,
        schemaHint: ASK_SCHEMA_HINT,
        model,
        apiKey,
      })
    );
  // Boş cevap genelde geçici: bir kez daha denenir, öğrenci hata görmez.
  let a = "";
  try {
    a = await once();
  } catch (e) {
    if (!(e instanceof Error) || e.message !== EMPTY_TEXT) throw e;
  }
  if (!a) a = await once();
  if (!a) throw new Error(EMPTY_TEXT);
  return a;
}

export const STORY_SCHEMA = {
  type: "object",
  required: ["score", "covered", "links", "fixes", "praise", "next"],
  properties: {
    score: { type: "number" },
    covered: { type: "array", items: { type: "number" } },
    links: { type: "array", items: { type: "string" } },
    fixes: { type: "array", items: { type: "array", items: { type: "string" } } },
    praise: { type: "string" },
    next: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const STORY_SCHEMA_HINT = '{"score":0-100,"covered":[0,2],"links":["and"],"fixes":[["söylenen","doğrusu","neden"]],"praise":"","next":""}';

export interface StoryFix {
  said: string;
  better: string;
  why: string;
}

export interface StoryReport {
  score: number;
  covered: number[];
  links: string[];
  fixes: StoryFix[];
  praise: string;
  next: string;
}

/** Hocanın anlatım raporunu güvenli biçime getirir (saf; test altında). */
export function normalizeStoryReport(raw: unknown, total: number): StoryReport {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const n = Number(o.score);
  const covered = [...new Set(arr(o.covered).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < total))].sort((a, b) => a - b);
  const fixes: StoryFix[] = [];
  for (const f of arr(o.fixes)) {
    const x = Array.isArray(f) ? f.map(str) : [];
    const g = f && typeof f === "object" && !Array.isArray(f) ? (f as Record<string, unknown>) : null;
    const said = g ? str(g.said) : x[0] ?? "";
    const better = g ? str(g.better) : x[1] ?? "";
    const why = g ? str(g.why) : x[2] ?? "";
    if (better && said !== better) fixes.push({ said, better, why });
    if (fixes.length >= 4) break;
  }
  return {
    score: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0,
    covered,
    links: [...new Set(arr(o.links).map(str).filter(Boolean))].slice(0, 8),
    fixes,
    praise: str(o.praise),
    next: str(o.next),
  };
}

/** "1 dakikada anlat": hikâyenin tek seferde anlatımını hoca değerlendirir. */
export async function evaluateStory(profile: Profile, input: StoryEvalInput): Promise<StoryReport> {
  await guardBudget(profile);
  const { provider, model, apiKey } = requireKey(profile);
  const raw = await provider.structured<unknown>({
    system: storyEvalSystem(input),
    userMessage: storyEvalUser(input),
    schema: STORY_SCHEMA as unknown as Record<string, unknown>,
    schemaHint: STORY_SCHEMA_HINT,
    model,
    apiKey,
  });
  return normalizeStoryReport(raw, input.sentences.length);
}
