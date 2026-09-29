import Anthropic from "@anthropic-ai/sdk";
import { getActivePack } from "./languages";
import { validateLevelChange } from "./levels";
import { findOpenSameTopic } from "./mistakes";
import { scheduleReminder } from "./notifications";
import { progressDigest, readingPerformance } from "./progress";
import { fluencyTrend } from "./fluency";
import { COMPLIANCE_WARN } from "./reading";
import { loadStatsSummary, recordStat } from "./statsStore";
import { cardMemory, deckStats, Difficulty, dueCards, gradeCard, newCard, strugglingCards } from "./srs";
import {
  loadFluency,
  loadMistakes,
  loadNotes,
  loadReadings,
  loadVocab,
  saveMistakes,
  saveNotes,
  saveProfile,
  saveVocab,
} from "./storage";
import {
  Assessment,
  CurriculumModule,
  NavigationSuggestion,
  Profile,
  Track,
  VocabCard,
} from "./types";

/** Agentic tur boyunca taşınan bağlam. Profil değişiklikleri burada birikir. */
export interface AgentContext {
  profile: Profile;
  profileChanged: boolean;
  currentModuleId?: string;
  /** Aktif parkur — hafıza ve kelime filtrelemesi için. */
  currentTrack?: Track;
  /** ekrana_git aracıyla önerilen yönlendirme (zorlamaz). */
  pendingNavigation?: NavigationSuggestion;
}

export interface ToolOutcome {
  /** Modele geri dönen sonuç metni. */
  result: string;
  /** UI'da rozet olarak gösterilecek Türkçe özet (yoksa gösterilmez). */
  summary?: string;
}

const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * ekrana_git'in kabul ettiği ekranlar — TEK KAYNAK.
 *
 * Eskiden liste iki yerde ayrı yazılıydı (araç şeması ve çalışma-zamanı
 * doğrulaması) ve ayrıştılar: "fluency" şemaya eklendi ama doğrulamaya
 * eklenmedi. Sonuç, modelin geçerli sandığı bir çağrının sessizce
 * reddedilmesiydi — hoca Akıcılık Odası'nı ASLA öneremezdi ve kimse
 * hatayı görmezdi.
 */
export const NAV_SCREENS = [
  "dashboard",
  "review",
  "quiz",
  "pronunciation",
  "mistakes",
  "module",
  "reading",
  "shadowing",
  "fluency",
  "conversation",
  "sentences",
] as const;

// ---------------------------------------------------------------------------
// OKUMA ARAÇLARI — Üstaz'ın kendi yazdığı veriyi görebilmesi için
// ---------------------------------------------------------------------------

const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: "kelime_ara",
    description:
      "Öğrencinin kelime defterine bakar. Bir kelimeyi daha önce öğretip öğretmediğini kontrol etmek, defterdeki kelimelerle alıştırma kurmak veya 'ne öğrendim' sorusuna cevap vermek için çağır. Filtre vermezsen en son eklenenleri döndürür.",
    input_schema: {
      type: "object",
      properties: {
        arama: {
          type: "string",
          description:
            "Hedef dilde, okunuşta veya Türkçe anlamda geçen metin. Belirli bir kelimeyi kontrol ederken kullan.",
        },
        track: {
          type: "string",
          enum: ["konusma", "okuma"],
          description: "Sadece bu parkurun kelimeleri",
        },
        limit: { type: "integer", description: "Kaç kelime döndürülsün (varsayılan 25)" },
      },
      required: [],
    },
  },
  {
    name: "tekrar_durumu",
    description:
      "Öğrencinin kelime tekrar performansını (aralıklı tekrar verisi) gösterir: kaç kelime tekrarı gelmiş, hangilerinde sürekli zorlanıyor, hangilerini artık ezberlemiş. Derse başlarken ve seviye_guncelle çağırmadan ÖNCE mutlaka bak — bu, öğrencinin gerçek hatırlama performansının tek objektif kaynağı.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "hafiza_oku",
    description:
      "Hata defterini ve kendi geçmiş notlarını arar. Sistem promptunda sana sadece son kayıtlar veriliyor; daha eskiye bakmak veya belirli bir konudaki tüm hataları görmek istediğinde bu aracı çağır.",
    input_schema: {
      type: "object",
      properties: {
        tur: {
          type: "string",
          enum: ["hatalar", "notlar", "hepsi"],
          description: "Neye bakılacak (varsayılan: hepsi)",
        },
        konu: { type: "string", description: "Bu metni içeren kayıtlar (konu/içerik araması)" },
        cozulmusleri_dahil_et: {
          type: "boolean",
          description: "Çözülmüş olarak işaretlenmiş hatalar da gelsin mi (varsayılan false)",
        },
        limit: { type: "integer", description: "Kaç kayıt (varsayılan 25)" },
      },
      required: [],
    },
  },
  {
    name: "ilerleme_durumu",
    description:
      "Cihazın TUTTUĞU objektif yeterlilik verisini gösterir: okuduğunu anlama soru skorları, sesbirim ayırt etme doğruluğu, haftalık üretim (kaç cümle üretti, okudu, gölgeledi) ve aktif gün sayısı. Bunlar öğrencinin beyanı değil, ölçülmüş sonuçlardır. seviye_guncelle çağırmadan ÖNCE tekrar_durumu ile birlikte MUTLAKA bak: kelime hatırlama tek başına seviye demek değildir; anlama ve kulak verisi olmadan verilen seviye kararı temelsizdir.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "mufredat_oku",
    description:
      "Müfredattaki modülleri, id'lerini, seviyelerini ve tamamlanma durumlarını listeler. modul_tamamla veya modul_ekle çağırmadan ÖNCE bunu çağır — id'yi tahmin etme, buradan al; ayrıca mevcut bir modülün kopyasını eklemekten kaçın.",
    input_schema: {
      type: "object",
      properties: {
        track: { type: "string", enum: ["konusma", "okuma"], description: "Sadece bu parkur" },
        sadece_tamamlanmamis: { type: "boolean", description: "Sadece bitmemiş modüller" },
      },
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// YAZMA VE DÜZELTME ARAÇLARI
// ---------------------------------------------------------------------------

const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: "kelime_kaydet",
    description:
      "Kelime defterine yeni bir kelime/kalıp ekler. Öğrencinin bilmediği ya da yeni öğrendiği her önemli kelime için çağır. Aynı kelime zaten varsa reddedilir — emin değilsen önce kelime_ara ile bak.",
    input_schema: {
      type: "object",
      properties: {
        arabic: { type: "string", description: "Kelime/kalıp, hedef dilin kendi yazımıyla" },
        transliteration: {
          type: "string",
          description: "Okunuş (ayrı alfabeli dillerde Latin transkripsiyon; gerekmiyorsa kelimenin kendisi)",
        },
        turkish: { type: "string", description: "Türkçe anlamı" },
        track: {
          type: "string",
          enum: ["konusma", "okuma"],
          description: "konusma = konuşma parkuru, okuma = okuma parkuru",
        },
        note: { type: "string", description: "İsteğe bağlı kısa kullanım notu veya örnek cümle" },
        zorluk: {
          type: "string",
          enum: ["kolay", "orta", "zor"],
          description:
            "Bu öğrenci için ne kadar zor. 'zor' seçersen kelime tekrar sisteminde daha sık sorulur.",
        },
      },
      required: ["arabic", "transliteration", "turkish", "track"],
    },
  },
  {
    name: "kelime_duzelt",
    description:
      "Kelime defterindeki bir kaydı düzeltir (yanlış anlam, eksik transkripsiyon, yanlış parkur). Önce kelime_ara ile id'yi al.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "kelime_ara'dan gelen kart id'si" },
        transliteration: { type: "string" },
        turkish: { type: "string" },
        track: { type: "string", enum: ["konusma", "okuma"] },
        note: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "kelime_sil",
    description:
      "Kelime defterinden bir kaydı siler. Yanlış eklenmiş, mükerrer veya öğrenci için anlamsız kelimeler için kullan. Öğrenci zorlanıyor diye SİLME — zorluk normaldir.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "kelime_ara'dan gelen kart id'si" },
        sebep: { type: "string", description: "Kısa gerekçe" },
      },
      required: ["id", "sebep"],
    },
  },
  {
    name: "kelime_puanla",
    description:
      "Kelime sınavında (veya derste bir kelimeyi yokladığında) öğrencinin cevabına göre o kartın tekrar takvimini günceller — aralıklı tekrar sistemine SEN hükmedersin. Her sınav cevabından sonra dürüstçe çağır: takvimi bu belirler. id'yi tekrar_durumu veya kelime_ara çıktısındaki id alanından al.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Kart id'si" },
        sonuc: {
          type: "string",
          enum: ["bilemedi", "zor", "bildi", "cok_kolay"],
          description:
            "bilemedi = hatırlayamadı (kart başa döner), zor = zorlanarak bildi, bildi = normal bildi, cok_kolay = anında bildi",
        },
      },
      required: ["id", "sonuc"],
    },
  },
  {
    name: "hata_kaydet",
    description:
      "Öğrencinin anlamlı bir dil hatasını hata defterine kaydeder. Tekrarlanan veya öğretici hatalar için çağır. Önemsiz yazım sürçmelerini kaydetme.",
    input_schema: {
      type: "object",
      properties: {
        mistake: { type: "string", description: "Öğrencinin yanlış söylediği/yazdığı hâli" },
        correction: { type: "string", description: "Doğru hâli (hedef dilin yazımı + gerekiyorsa okunuş)" },
        explanation: { type: "string", description: "Kısa Türkçe açıklama: neden yanlış" },
        topic: { type: "string", description: "İlgili gramer/kelime konusu, örn. 'geçmiş zaman'" },
        track: { type: "string", enum: ["konusma", "okuma"], description: "Hangi parkurda yapıldı" },
      },
      required: ["mistake", "correction", "explanation", "topic"],
    },
  },
  {
    name: "hata_cozuldu",
    description:
      "Bir hatayı 'çözüldü' olarak işaretler; artık hafızana taşınmaz ve ders yönlendirmesinden düşer. Öğrenci o konuyu birkaç kez doğru kullandığında çağır — böylece defter güncel kalır ve çözülmüş konuları boşuna tekrar ettirmezsin.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "hafiza_oku'dan gelen hata id'si" },
      },
      required: ["id"],
    },
  },
  {
    name: "not_yaz",
    description:
      "Kendine sonraki dersler için hafıza notu yazar. Ders sonlarında veya önemli bir gözlemde çağır: öğrenci nerede kaldı, neyi sevdi, sıradaki adım ne.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string", description: "Kısa ve öz Türkçe not" } },
      required: ["note"],
    },
  },
  {
    name: "not_sil",
    description: "Geçerliliğini yitirmiş bir notunu siler. Önce hafiza_oku ile id'yi al.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "hafiza_oku'dan gelen not id'si" } },
      required: ["id"],
    },
  },
  {
    name: "seviye_guncelle",
    description:
      "Öğrencinin resmi seviyesini ve/veya güçlü-zayıf yönlerini günceller. Seviye değiştiğine ikna olduğunda çağır — ama ÖNCE tekrar_durumu ile objektif hatırlama verisine bak. Seviyeyi yükseltirken zayıf yönleri de güncellemeyi unutma: eski zayıf yönler güncellenmezse dersler sonsuza dek onlara göre şekillenir.",
    input_schema: {
      type: "object",
      properties: {
        speakingLevel: { type: "string", enum: LEVELS, description: "Yeni konuşma seviyesi" },
        readingLevel: { type: "string", enum: LEVELS, description: "Yeni okuma seviyesi" },
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "Güncel güçlü yönler (verirsen eskisinin yerine geçer)",
        },
        weaknesses: {
          type: "array",
          items: { type: "string" },
          description: "Güncel zayıf yönler (verirsen eskisinin yerine geçer)",
        },
        summary: { type: "string", description: "Öğrenciye hitaben güncel kısa özet" },
        reason: { type: "string", description: "Güncelleme gerekçesi (Türkçe) — kayda geçer" },
      },
      required: ["reason"],
    },
  },
  {
    name: "modul_ekle",
    description:
      "Müfredata yeni bir modül ekler. Önce mufredat_oku ile mevcutları gör, kopya ekleme.",
    input_schema: {
      type: "object",
      properties: {
        track: { type: "string", enum: ["konusma", "okuma"] },
        title: { type: "string", description: "Türkçe modül başlığı" },
        description: { type: "string", description: "Türkçe kısa açıklama" },
        level: { type: "string", enum: LEVELS },
        objectives: {
          type: "array",
          items: { type: "string" },
          description: "3-5 somut öğrenme hedefi (Türkçe)",
        },
      },
      required: ["track", "title", "description", "level", "objectives"],
    },
  },
  {
    name: "modul_tamamla",
    description:
      "Bir müfredat modülünü tamamlandı olarak işaretler. Hedeflere gerçekten ulaşıldığında çağır. id'yi mufredat_oku'dan al.",
    input_schema: {
      type: "object",
      properties: { moduleId: { type: "string", description: "Modül id'si" } },
      required: ["moduleId"],
    },
  },
];

// ---------------------------------------------------------------------------
// İNİSİYATİF ARAÇLARI
// ---------------------------------------------------------------------------

const INITIATIVE_TOOLS: Anthropic.Tool[] = [
  {
    name: "ekrana_git",
    description:
      "Öğrenciye bir sonraki adım için ekran önerir; sohbetin altında tıklanabilir bir öneri olarak görünür (zorlama yok). Modülü tamamladıktan sonra sıradaki modülü, tekrarı gelen kelime varsa kelime defterini, telaffuz sorunu görürsen telaffuz stüdyosunu öner. Okuma çalışması önereceksen 'reading' ile Okuma Salonu'nu öner — öğrenci orada kelime defterinden örülmüş metin okur; tekrarı gelen kelimeler birikince de uygundur. Akıcılık/telaffuz pratiği için 'shadowing' (gölgeleme: dinle, üstüne konuş) önerebilirsin. Öğrenci cümle kurabiliyor ama DURAKSAYARAK konuşuyorsa 'fluency' ile Akıcılık Odası'nı öner: aynı konuyu azalan sürede üç kez anlatır (4/3/2) ve hızlanması ölçülür — akıcılığın asıl antrenmanı budur.",
    input_schema: {
      type: "object",
      properties: {
        screen: {
          type: "string",
          enum: [...NAV_SCREENS],
          description: "Hedef ekran. 'module' seçersen moduleId de ver.",
        },
        moduleId: { type: "string", description: "screen='module' ise açılacak modülün id'si" },
        label: { type: "string", description: "Düğme metni, örn. '📇 12 kelime tekrarı seni bekliyor'" },
      },
      required: ["screen", "label"],
    },
  },
  {
    name: "hatirlatici_kur",
    description:
      "Öğrencinin telefonuna ileri bir zamana bildirim kurar. Ders sonunda, tekrarı gelecek kelimeler için veya öğrenci 'yarın devam edelim' dediğinde kullan. Öğrencinin çalışma sürekliliğini korumak senin sorumluluğun — sen hatırlatmazsan kimse hatırlatmaz.",
    input_schema: {
      type: "object",
      properties: {
        saat_sonra: {
          type: "number",
          description: "Kaç saat sonra bildirim gitsin (örn. 24 = yarın bu saatte). 1-336 arası.",
        },
        mesaj: {
          type: "string",
          description:
            "Bildirimde görünecek kısa, sıcak Türkçe mesaj (hedef dilden bir kelime serpiştirebilirsin)",
        },
      },
      required: ["saat_sonra", "mesaj"],
    },
  },
];

/** Ders ve serbest sohbet: tam araç seti. */
export const TEACHER_TOOLS: Anthropic.Tool[] = [
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...INITIATIVE_TOOLS,
];

// ---------------------------------------------------------------------------
// YÜRÜTME
// ---------------------------------------------------------------------------

function fmtCard(c: VocabCard): string {
  const tracks = getActivePack().tracks;
  const bits = [
    `id=${c.id}`,
    c.arabic,
    `(${c.transliteration})`,
    `= ${c.turkish}`,
    `[${tracks[c.track].short.toLowerCase()}]`,
  ];
  const mem = cardMemory(c);
  const perf =
    c.reps === 0 && (c.lapses ?? 0) === 0
      ? "hiç tekrar edilmedi"
      : `${c.reps} tekrar, ${c.lapses ?? 0} kez unutuldu, zorluk ${mem.difficulty.toFixed(1)}/10, hafıza gücü ${
          mem.stability === undefined
            ? "—"
            : mem.stability < 1
              ? "1 günden az"
              : `${Math.round(mem.stability)} gün`
        }`;
  return `- ${bits.join(" ")} — ${perf}`;
}

/** Profil değişikliğini bağlama yazar VE hemen diske kaydeder (tur yarıda kalsa bile kaybolmaz). */
async function commitProfile(ctx: AgentContext, next: Profile): Promise<void> {
  ctx.profile = next;
  ctx.profileChanged = true;
  await saveProfile(next);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: AgentContext
): Promise<ToolOutcome> {
  switch (name) {
    // ---------------- OKUMA ----------------

    case "kelime_ara": {
      const cards = await loadVocab();
      if (cards.length === 0) return { result: "Kelime defteri henüz boş." };
      const q = input.arama ? String(input.arama).toLowerCase().trim() : "";
      const track = input.track === "okuma" || input.track === "konusma" ? input.track : undefined;
      const limit = Math.min(Number(input.limit) || 25, 100);
      let found = cards;
      if (track) found = found.filter((c) => c.track === track);
      if (q) {
        found = found.filter(
          (c) =>
            c.arabic.includes(q) ||
            c.transliteration.toLowerCase().includes(q) ||
            c.turkish.toLowerCase().includes(q)
        );
      }
      if (found.length === 0) {
        return {
          result: q
            ? `"${input.arama}" için kelime defterinde kayıt yok. (Defterde toplam ${cards.length} kelime var.)`
            : "Bu filtreyle kelime bulunamadı.",
        };
      }
      const shown = found.slice(-limit).reverse();
      return {
        result: `${found.length} kelime bulundu (en yenisi üstte, ${shown.length} tanesi gösteriliyor):\n${shown
          .map(fmtCard)
          .join("\n")}`,
      };
    }

    case "tekrar_durumu": {
      const cards = await loadVocab();
      if (cards.length === 0) {
        return { result: "Kelime defteri boş — henüz tekrar verisi yok." };
      }
      const s = deckStats(cards);
      const due = dueCards(cards).slice(0, 10);
      const hard = strugglingCards(cards, 10);
      const lines = [
        `Toplam ${s.total} kelime | tekrarı gelen: ${s.due} | hiç çalışılmamış: ${s.neverReviewed} | zorlanılan: ${s.struggling} | ezberlenmiş: ${s.mastered}`,
      ];
      if (hard.length > 0) {
        lines.push(`\nEN ÇOK ZORLANDIĞI KELİMELER (bunları derste tekrar ettir):\n${hard.map(fmtCard).join("\n")}`);
      }
      if (due.length > 0) {
        lines.push(`\nTEKRARI GELENLER (ilk ${due.length}):\n${due.map(fmtCard).join("\n")}`);
      }
      if (hard.length === 0 && s.total > 0) {
        lines.push("\nHenüz zorlandığı bir kelime yok — ya çok iyi gidiyor ya da tekrar yapmamış.");
      }
      return { result: lines.join("\n") };
    }

    case "hafiza_oku": {
      const tur = String(input.tur ?? "hepsi");
      const konu = input.konu ? String(input.konu).toLowerCase().trim() : "";
      const includeResolved = input.cozulmusleri_dahil_et === true;
      const limit = Math.min(Number(input.limit) || 25, 100);
      const parts: string[] = [];

      if (tur === "hatalar" || tur === "hepsi") {
        let mistakes = await loadMistakes();
        if (!includeResolved) mistakes = mistakes.filter((m) => !m.resolved);
        if (konu) {
          mistakes = mistakes.filter(
            (m) =>
              m.topic.toLowerCase().includes(konu) ||
              m.mistake.toLowerCase().includes(konu) ||
              m.correction.toLowerCase().includes(konu) ||
              m.explanation.toLowerCase().includes(konu)
          );
        }
        parts.push(
          mistakes.length === 0
            ? "HATA DEFTERİ: eşleşen kayıt yok."
            : `HATA DEFTERİ (${mistakes.length} kayıt, son ${Math.min(limit, mistakes.length)} tanesi):\n${mistakes
                .slice(-limit)
                .reverse()
                .map(
                  (m) =>
                    `- id=${m.id} [${m.topic}]${m.resolved ? " (çözüldü)" : ""} "${m.mistake}" → "${m.correction}" — ${m.explanation}`
                )
                .join("\n")}`
        );
      }

      if (tur === "notlar" || tur === "hepsi") {
        let notes = await loadNotes();
        if (konu) notes = notes.filter((n) => n.note.toLowerCase().includes(konu));
        parts.push(
          notes.length === 0
            ? "NOTLARIN: eşleşen kayıt yok."
            : `NOTLARIN (${notes.length} kayıt, son ${Math.min(limit, notes.length)} tanesi):\n${notes
                .slice(-limit)
                .reverse()
                .map((n) => `- id=${n.id} (${n.createdAt.slice(0, 10)}) ${n.note}`)
                .join("\n")}`
        );
      }

      return { result: parts.join("\n\n") };
    }

    case "ilerleme_durumu": {
      const [stats, readings] = await Promise.all([loadStatsSummary(), loadReadings()]);
      const digest = progressDigest(
        stats,
        readingPerformance(readings, COMPLIANCE_WARN),
        fluencyTrend(await loadFluency())
      );
      return { result: digest.trim(), summary: "📊 ilerleme verine baktı" };
    }

    case "mufredat_oku": {
      const curriculum = ctx.profile.curriculum;
      if (!curriculum || curriculum.modules.length === 0) {
        return { result: "Henüz müfredat yok." };
      }
      const track = input.track === "okuma" || input.track === "konusma" ? input.track : undefined;
      const onlyOpen = input.sadece_tamamlanmamis === true;
      let modules = curriculum.modules;
      if (track) modules = modules.filter((m) => m.track === track);
      if (onlyOpen) modules = modules.filter((m) => !ctx.profile.completedModuleIds.includes(m.id));
      if (modules.length === 0) return { result: "Bu filtreyle modül yok." };
      const trackShorts = getActivePack().tracks;
      const lines = modules.map((m) => {
        const done = ctx.profile.completedModuleIds.includes(m.id);
        const active = m.id === ctx.currentModuleId ? " ← ŞU AN İŞLENEN" : "";
        return `- id=${m.id} [${trackShorts[m.track].short.toLowerCase()} ${m.level}] ${done ? "✓" : "○"} ${m.title}${active}`;
      });
      const doneCount = curriculum.modules.filter((m) =>
        ctx.profile.completedModuleIds.includes(m.id)
      ).length;
      return {
        result: `MÜFREDAT (${doneCount}/${curriculum.modules.length} tamamlandı):\n${lines.join("\n")}`,
      };
    }

    // ---------------- YAZMA ----------------

    case "kelime_kaydet": {
      const arabic = String(input.arabic ?? "").trim();
      if (!arabic) return { result: "Hata: arabic alanı boş." };
      const cards = await loadVocab();
      const existing = cards.find((c) => c.arabic === arabic);
      if (existing) {
        return {
          result: `"${arabic}" zaten kayıtlı (id=${existing.id}, anlam: ${existing.turkish}). Düzeltmek istersen kelime_duzelt kullan.`,
        };
      }
      const zorluk = ["kolay", "orta", "zor"].includes(String(input.zorluk))
        ? (String(input.zorluk) as Difficulty)
        : "orta";
      const card = newCard(
        arabic,
        String(input.transliteration ?? ""),
        String(input.turkish ?? ""),
        (input.track === "okuma" ? "okuma" : "konusma") as Track,
        input.note ? String(input.note) : undefined,
        zorluk
      );
      await saveVocab([...cards, card]);
      return {
        result: `Kelime kaydedildi (id=${card.id}, zorluk: ${zorluk}). Defterde toplam ${cards.length + 1} kelime var.`,
        summary: `📇 Kelime eklendi: ${arabic} (${card.turkish})`,
      };
    }

    case "kelime_duzelt": {
      const id = String(input.id ?? "");
      const cards = await loadVocab();
      const card = cards.find((c) => c.id === id);
      if (!card) return { result: `Hata: '${id}' id'li kelime bulunamadı. kelime_ara ile doğru id'yi al.` };
      const updated: VocabCard = {
        ...card,
        transliteration: input.transliteration ? String(input.transliteration) : card.transliteration,
        turkish: input.turkish ? String(input.turkish) : card.turkish,
        track:
          input.track === "okuma" || input.track === "konusma" ? (input.track as Track) : card.track,
        note: input.note !== undefined ? String(input.note) : card.note,
      };
      await saveVocab(cards.map((c) => (c.id === id ? updated : c)));
      return {
        result: `Kelime güncellendi: ${updated.arabic} = ${updated.turkish}`,
        summary: `✏️ Kelime düzeltildi: ${updated.arabic}`,
      };
    }

    case "kelime_sil": {
      const id = String(input.id ?? "");
      const cards = await loadVocab();
      const card = cards.find((c) => c.id === id);
      if (!card) return { result: `Hata: '${id}' id'li kelime bulunamadı.` };
      await saveVocab(cards.filter((c) => c.id !== id));
      return {
        result: `Kelime silindi: ${card.arabic}. Gerekçe: ${String(input.sebep ?? "")}`,
        summary: `🗑️ Kelime silindi: ${card.arabic}`,
      };
    }

    case "kelime_puanla": {
      const id = String(input.id ?? "");
      const cards = await loadVocab();
      const card = cards.find((c) => c.id === id);
      if (!card) {
        return { result: `Hata: '${id}' id'li kelime bulunamadı. tekrar_durumu veya kelime_ara ile doğru id'yi al.` };
      }
      const gradeMap: Record<string, 0 | 1 | 2 | 3> = {
        bilemedi: 0,
        zor: 1,
        bildi: 2,
        cok_kolay: 3,
      };
      const sonuc = String(input.sonuc ?? "");
      const grade = gradeMap[sonuc];
      if (grade === undefined) {
        return { result: `Hata: geçersiz sonuç '${sonuc}'. bilemedi/zor/bildi/cok_kolay olmalı.` };
      }
      const updated = gradeCard(card, grade);
      await saveVocab(cards.map((c) => (c.id === id ? updated : c)));
      const when =
        updated.intervalDays <= 0
          ? "10 dakika sonra tekrar sorulacak"
          : `${Math.round(updated.intervalDays)} gün sonra tekrar sorulacak`;
      const label =
        sonuc === "bilemedi" ? "bilemedi" : sonuc === "zor" ? "zorlandı" : sonuc === "bildi" ? "bildi" : "çok kolay geldi";
      return {
        result: `"${card.arabic}" puanlandı (${label}); ${when}.`,
        summary: `🧠 ${card.arabic} → ${label}`,
      };
    }

    case "hata_kaydet": {
      const entries = await loadMistakes();
      const topic = String(input.topic ?? "");
      // Aynı konuda AÇIK bir kayıt varsa yeni kayıt açılmaz: sayaç artar.
      // Tekrarlayan hata fosilleşme sinyalidir; sayaç 3'e ulaşınca hafıza
      // bağlamı bu hatayı "derste açıkça işle" diye öne çıkarır.
      // Eşleşme birebir metin değil, anlamlı köklerin örtüşmesi: model konuyu
      // her seferinde birazcık farklı yazdığında sayaç boşa gitmesin.
      const existing = findOpenSameTopic(entries, topic);
      if (existing) {
        const timesSeen = (existing.timesSeen ?? 1) + 1;
        await saveMistakes(
          entries.map((m) =>
            m.id === existing.id
              ? {
                  ...m,
                  timesSeen,
                  // En güncel örnek daha öğretici olabilir; açıklamayı tazele.
                  mistake: String(input.mistake ?? existing.mistake),
                  correction: String(input.correction ?? existing.correction),
                  explanation: String(input.explanation ?? existing.explanation),
                  createdAt: new Date().toISOString(),
                }
              : m
          )
        );
        return {
          result: `DİKKAT: "${topic}" konusundaki hata ${timesSeen}. kez kaydedildi — bu hata fosilleşiyor. ${
            timesSeen >= 3
              ? "Artık kenar notu yetmez: bu konuyu bu derste veya bir sonrakinde AÇIKÇA işle, öğrenciye kısa hedefli alıştırma yaptır."
              : "Fırsat buldukça bu konuyu geri döndür."
          }`,
          summary: `📒 Aynı hata ${timesSeen}. kez: ${topic}`,
        };
      }
      const entry = {
        id: `m${Date.now()}${Math.floor(Math.random() * 1000)}`,
        mistake: String(input.mistake ?? ""),
        correction: String(input.correction ?? ""),
        explanation: String(input.explanation ?? ""),
        topic,
        track:
          input.track === "okuma" || input.track === "konusma"
            ? (input.track as Track)
            : ctx.currentTrack,
        createdAt: new Date().toISOString(),
        timesSeen: 1,
      };
      await saveMistakes([...entries, entry]);
      return {
        result: `Hata deftere kaydedildi (id=${entry.id}, konu: ${entry.topic}).`,
        summary: `📒 Hata deftere işlendi: ${entry.topic}`,
      };
    }

    case "hata_cozuldu": {
      const id = String(input.id ?? "");
      const entries = await loadMistakes();
      const entry = entries.find((m) => m.id === id);
      if (!entry) return { result: `Hata: '${id}' id'li kayıt bulunamadı. hafiza_oku ile id'yi al.` };
      if (entry.resolved) return { result: `'${id}' zaten çözülmüş olarak işaretli.` };
      await saveMistakes(
        entries.map((m) =>
          m.id === id ? { ...m, resolved: true, resolvedAt: new Date().toISOString() } : m
        )
      );
      void recordStat("mistakeClosed");
      return {
        result: `"${entry.topic}" konusundaki hata çözüldü olarak işaretlendi; artık hafızana taşınmayacak.`,
        summary: `✅ Hata çözüldü: ${entry.topic}`,
      };
    }

    case "not_yaz": {
      const notes = await loadNotes();
      const note = {
        id: `n${Date.now()}${Math.floor(Math.random() * 1000)}`,
        note: String(input.note ?? ""),
        createdAt: new Date().toISOString(),
      };
      await saveNotes([...notes, note]);
      return {
        result: `Not kaydedildi (id=${note.id}).`,
        summary: `🗒️ ${getActivePack().teacherName} kendine not aldı`,
      };
    }

    case "not_sil": {
      const id = String(input.id ?? "");
      const notes = await loadNotes();
      if (!notes.some((n) => n.id === id)) {
        return { result: `Hata: '${id}' id'li not bulunamadı.` };
      }
      await saveNotes(notes.filter((n) => n.id !== id));
      return { result: "Not silindi.", summary: "🗒️ Eski not silindi" };
    }

    case "seviye_guncelle": {
      const a = ctx.profile.assessment;
      if (!a) return { result: "Hata: henüz seviye değerlendirmesi yok." };
      // Seviye kapısı: şemayı her sağlayıcı sunucuda zorlamıyor; geçersiz
      // yazım ve tek turda çok kademe sıçrama burada durdurulur.
      const rejections: string[] = [];
      let speaking: string | undefined;
      let reading: string | undefined;
      if (input.speakingLevel !== undefined) {
        const v = validateLevelChange(a.speakingLevel, input.speakingLevel);
        if (v.error) rejections.push(`Konuşma seviyesi yazılmadı — ${v.error}`);
        else speaking = v.value;
      }
      if (input.readingLevel !== undefined) {
        const v = validateLevelChange(a.readingLevel, input.readingLevel);
        if (v.error) rejections.push(`Okuma seviyesi yazılmadı — ${v.error}`);
        else reading = v.value;
      }
      const strengths = Array.isArray(input.strengths) ? input.strengths.map(String) : undefined;
      const weaknesses = Array.isArray(input.weaknesses) ? input.weaknesses.map(String) : undefined;
      const summary = input.summary ? String(input.summary) : undefined;
      if (!speaking && !reading && !strengths && !weaknesses && !summary) {
        // Tek isteği reddedilen seviye değişimiyse modele NEDEN'ini söyle;
        // yoksa "hiçbir alan verilmedi" diye yanıltıcı bir hata döner.
        if (rejections.length > 0) return { result: rejections.join(" ") };
        return { result: "Hata: en az bir alan (seviye, güçlü/zayıf yönler veya özet) vermelisin." };
      }
      await commitProfile(ctx, {
        ...ctx.profile,
        assessment: {
          ...a,
          speakingLevel: speaking ?? a.speakingLevel,
          readingLevel: reading ?? a.readingLevel,
          strengths: strengths ?? a.strengths,
          weaknesses: weaknesses ?? a.weaknesses,
          summary: summary ?? a.summary,
        },
      });

      // Gerekçeyi kayda geçir — böylece kararın izi kalır ve sonraki derslerde görürsün.
      const reason = String(input.reason ?? "");
      const notes = await loadNotes();
      await saveNotes([
        ...notes,
        {
          id: `n${Date.now()}${Math.floor(Math.random() * 1000)}`,
          note: `[Seviye güncellemesi] ${reason}`,
          createdAt: new Date().toISOString(),
        },
      ]);

      const parts = [
        speaking ? `konuşma → ${speaking}` : null,
        reading ? `okuma → ${reading}` : null,
        weaknesses ? "zayıf yönler güncellendi" : null,
        strengths ? "güçlü yönler güncellendi" : null,
      ].filter(Boolean);
      const note = rejections.length > 0 ? ` ${rejections.join(" ")}` : "";
      return {
        result: `Güncellendi: ${parts.join(", ")}. Gerekçe not defterine işlendi.${note}`,
        summary: `📈 ${parts.join(", ")}`,
      };
    }

    case "modul_ekle": {
      const curriculum = ctx.profile.curriculum;
      if (!curriculum) return { result: "Hata: henüz müfredat yok." };
      const track = (input.track === "okuma" ? "okuma" : "konusma") as Track;
      const prefix = track === "konusma" ? "k" : "o";
      const existing = curriculum.modules.filter((m) => m.track === track).length;
      const module: CurriculumModule = {
        id: `${prefix}x${existing + 1}-${Date.now() % 10000}`,
        track,
        title: String(input.title ?? ""),
        description: String(input.description ?? ""),
        level: String(input.level ?? "A1"),
        objectives: Array.isArray(input.objectives) ? input.objectives.map(String) : [],
      };
      await commitProfile(ctx, {
        ...ctx.profile,
        curriculum: { ...curriculum, modules: [...curriculum.modules, module] },
      });
      return {
        result: `Modül eklendi: "${module.title}" (id: ${module.id}).`,
        summary: `🗺️ Müfredata modül eklendi: ${module.title}`,
      };
    }

    case "modul_tamamla": {
      const moduleId = String(input.moduleId ?? ctx.currentModuleId ?? "");
      const module = ctx.profile.curriculum?.modules.find((m) => m.id === moduleId);
      if (!module) {
        return {
          result: `Hata: '${moduleId}' id'li modül bulunamadı. mufredat_oku ile doğru id'yi al.`,
        };
      }
      if (ctx.profile.completedModuleIds.includes(moduleId)) {
        return { result: `Modül '${moduleId}' zaten tamamlanmış.` };
      }
      await commitProfile(ctx, {
        ...ctx.profile,
        completedModuleIds: [...ctx.profile.completedModuleIds, moduleId],
      });
      return {
        result: `Modül tamamlandı olarak işaretlendi: "${module.title}".`,
        summary: `✅ Modül tamamlandı: ${module.title}`,
      };
    }

    // ---------------- İNİSİYATİF ----------------

    case "ekrana_git": {
      const screen = String(input.screen ?? "");
      if (!(NAV_SCREENS as readonly string[]).includes(screen)) {
        return { result: `Hata: geçersiz ekran '${screen}'.` };
      }
      const moduleId = input.moduleId ? String(input.moduleId) : undefined;
      if (screen === "module") {
        const found = ctx.profile.curriculum?.modules.some((m) => m.id === moduleId);
        if (!found) {
          return { result: `Hata: '${moduleId}' id'li modül yok. mufredat_oku ile doğru id'yi al.` };
        }
      }
      ctx.pendingNavigation = {
        screen: screen as NavigationSuggestion["screen"],
        moduleId,
        label: String(input.label ?? "Devam et"),
      };
      return {
        result: "Öneri öğrenciye tıklanabilir bir düğme olarak gösterilecek.",
        summary: `➡️ Öneri: ${ctx.pendingNavigation.label}`,
      };
    }

    case "hatirlatici_kur": {
      const hours = Number(input.saat_sonra);
      if (!Number.isFinite(hours) || hours < 1 || hours > 336) {
        return { result: "Hata: saat_sonra 1 ile 336 (14 gün) arasında olmalı." };
      }
      const message = String(input.mesaj ?? "").trim();
      if (!message) return { result: "Hata: mesaj boş olamaz." };
      const outcome = await scheduleReminder(hours, message);
      if (!outcome.ok) return { result: `Hatırlatıcı kurulamadı: ${outcome.reason}` };
      const when = new Date(Date.now() + hours * 3600_000);
      return {
        result: `Hatırlatıcı kuruldu: ${when.toLocaleString("tr-TR")}`,
        summary: `⏰ Hatırlatıcı kuruldu (${hours} saat sonra)`,
      };
    }

    default:
      return { result: `Hata: bilinmeyen araç '${name}'.` };
  }
}
