/**
 * SİNİR AĞI SESİ — saf mantık (cihaz modülü yok; tests/voice.test.ts).
 *
 * Kullanıcının tespiti: "ChatGPT ve Gemini akıcı konuşuyor, bizimki robot."
 * Sebep mimari: onlarda ses sunucudaki ses modelinden gelir; bizde telefonun
 * 2015'ten kalma TTS motorundan. Prompt ne kadar iyi olursa olsun hoca robot
 * gibi konuşur, öğrencinin sesi de telefonun tanımasından geçer (Arapçada
 * zayıf). Gerçek çözüm, ChatGPT'nin yaptığının aynısı: sesi de ses
 * modelinden almak. Bu dosya o katmanın hesap ve karar kısmı.
 *
 * Telefon TTS'i kaldırılmıyor: internet yokken, anahtar yokken ya da ses
 * servisi düştüğünde yedek olarak duruyor.
 */
import type { LanguageId } from "./languages.ts";

/** OpenAI ses kimlikleri (gpt-4o-mini-tts). Türkçe tarifler seçim ekranı için. */
export const OPENAI_VOICES: { id: string; label: string; note: string }[] = [
  { id: "alloy", label: "Alloy", note: "nötr, dengeli" },
  { id: "ash", label: "Ash", note: "erkek, sıcak" },
  { id: "coral", label: "Coral", note: "kadın, canlı" },
  { id: "echo", label: "Echo", note: "erkek, sakin" },
  { id: "fable", label: "Fable", note: "anlatıcı, İngiliz tınısı" },
  { id: "nova", label: "Nova", note: "kadın, enerjik" },
  { id: "onyx", label: "Onyx", note: "erkek, derin" },
  { id: "sage", label: "Sage", note: "kadın, yumuşak" },
  { id: "shimmer", label: "Shimmer", note: "kadın, net" },
  { id: "verse", label: "Verse", note: "erkek, genç" },
];

export const DEFAULT_OPENAI_VOICE = "ash";
export const TTS_MODEL = "gpt-4o-mini-tts";
export const STT_MODEL = "gpt-4o-mini-transcribe";

/** Kullanıcının ses tercihi (profile.voice). */
export interface VoiceSettings {
  /** "device" = telefonun TTS'i; "openai" = ses modeli (OpenAI anahtarı gerekir). */
  provider: "device" | "openai";
  voiceId: string;
  /** Öğrencinin sesi de ses modeliyle çözülsün (Whisper ailesi). */
  transcribe: boolean;
  /**
   * Konuşma Odası'nın BEYNİ. "deepseek": DeepSeek anahtarı varsa oda onu
   * kullanır (≈ 1 TL/oturum), ders ekranları aktif sağlayıcıda kalır.
   * "active": oda da aktif sağlayıcıyı kullanır.
   */
  brain: "deepseek" | "active";
}

/**
 * VARSAYILAN: DeepSeek beyin + OpenAI ses. Kullanıcının kararı: konuşmada
 * pahalı olan kısım beyin değil ses; beyni ucuza, sesi iyisinden almak
 * toplamı ≈ 8 TL/oturuma indiriyor. İkisi de ANAHTAR VARSA devreye girer;
 * yoksa oda sessizce aktif sağlayıcıya ve telefon sesine düşer — Ayarlar bunu
 * açıkça söyler.
 */
export const DEFAULT_VOICE: VoiceSettings = {
  provider: "openai",
  voiceId: DEFAULT_OPENAI_VOICE,
  transcribe: true,
  brain: "deepseek",
};

/** Depodan gelen bozuk/eksik değer güvenli tercihe düşer. */
export function normalizeVoice(raw: unknown): VoiceSettings {
  const r = (raw ?? {}) as Partial<Record<keyof VoiceSettings, unknown>>;
  // Eksik alan varsayılana düşer; yalnız AÇIKÇA yazılmış tercih korunur.
  const provider = r.provider === "device" ? "device" : "openai";
  const voiceId =
    typeof r.voiceId === "string" && OPENAI_VOICES.some((v) => v.id === r.voiceId)
      ? r.voiceId
      : DEFAULT_OPENAI_VOICE;
  const transcribe = typeof r.transcribe === "boolean" ? r.transcribe : DEFAULT_VOICE.transcribe;
  const brain = r.brain === "active" ? "active" : "deepseek";
  return { provider, voiceId, transcribe, brain };
}

/**
 * Ses modeli kullanılabilir mi: tercih "openai" VE OpenAI anahtarı var.
 * Anahtarsız tercih sessizce telefona düşer — kullanıcıya bunu Ayarlar söyler.
 */
export function neuralVoiceActive(voice: VoiceSettings, openaiKey: string | undefined): boolean {
  return voice.provider === "openai" && !!openaiKey?.trim();
}

export function neuralTranscribeActive(
  voice: VoiceSettings,
  openaiKey: string | undefined
): boolean {
  return neuralVoiceActive(voice, openaiKey) && voice.transcribe;
}

/** Ses tanıma için ISO-639-1 dil kodu. */
export function sttLanguage(id: LanguageId): string {
  return id; // paket kimlikleri zaten ISO kodları (ar, en, es, fr, de, it, ru, fa)
}

/**
 * TTS'e giden metnin ÖN İŞLEMİ.
 *
 * Ses modeli okunuş parantezlerini, madde işaretlerini ve emojiyi de okur.
 * Konuşma promptu bunları yasaklıyor ama model ara sıra kaçırır; burada
 * ikinci savunma hattı. Arapça harekeler KORUNUR — ses modeli onları
 * telaffuz ipucu olarak kullanır.
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\((?:[^()]*[a-zA-ZâîûğışöüçĞİŞÖÜÇ'-]{2,}[^()]*)\)/g, "") // (okunuş) parantezleri
    .replace(/[*_#`>]+/g, "")
    .replace(/^\s*[-•·]\s+/gm, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Sessizlik kapısı — kayıt tabanlı dinlemede "sustu, sıra geçsin" kararı
// ---------------------------------------------------------------------------

/**
 * Metering (dB, ~-160..0) örneklerinden konuşma başlangıcı ve bitişi çıkarır.
 *
 * Neden var: ses modeliyle tanıma bir DOSYA ister; telefonun tanımasındaki
 * canlı ara metin yok. "Öğrenci sustu" kararı bu yüzden ses düzeyinden
 * verilir. Eşik SABİT DEĞİL: ortam gürültüsü telefondan telefona, odadan
 * odaya değişir; taban, o ana kadar görülen en düşük düzeyden öğrenilir ve
 * konuşma "tabanın belirgin üstü" sayılır.
 */
export interface SilenceGateOptions {
  /** Konuşma bittikten sonra bu kadar ms sessizlik → dur. */
  silenceMs: number;
  /** Konuşma hiç başlamazsa bu kadar ms sonra vazgeç. */
  noSpeechMs: number;
  /** Her hâlükârda bu kadar ms sonra dur (bütçe ve dosya boyutu). */
  maxMs: number;
  /** Tabanın kaç dB üstü konuşma sayılır. */
  riseDb?: number;
}

export type GateVerdict = "wait" | "stop" | "give-up";

export interface SilenceGate {
  /** Yeni örnek: zaman (ms) ve düzey (dB). Karar döner. */
  sample: (t: number, db: number | undefined) => GateVerdict;
  readonly speechStarted: boolean;
}

export function createSilenceGate(opts: SilenceGateOptions): SilenceGate {
  const rise = opts.riseDb ?? 12;
  let t0: number | null = null;
  /**
   * Taban SABİT BİR TAHMİNLE başlar (-60 dB, sessiz oda) ve konuşma
   * başlayana kadar ortama uyar. "Görülen en düşük değer" olsaydı, hemen
   * konuşmaya başlayan öğrencide taban konuşmanın kendisinden öğrenilir ve
   * konuşma hiç algılanmazdı — test bunu yakaladı.
   */
  let floor = -60;
  let speechStarted = false;
  let lastSpeechAt = 0;
  /** Bu düzeyin altı hiçbir odada konuşma sayılmaz (telefona yakın ses > -45). */
  const ABS_MIN_DB = -45;
  return {
    get speechStarted() {
      return speechStarted;
    },
    sample(t, db) {
      if (t0 === null) t0 = t;
      const elapsed = t - t0;
      if (elapsed >= opts.maxMs) return speechStarted ? "stop" : "give-up";
      if (db === undefined || !Number.isFinite(db)) {
        // Metering gelmiyor (bazı cihazlar): yalnız üst sınırlara güven.
        return "wait";
      }
      // Taban: konuşma başlamadan önce ortama yavaşça uyar (üstel ortalama);
      // başladıktan sonra yalnız aşağı iner ki uzun cümlede sürüklenmesin.
      if (!speechStarted) floor += (db - floor) * 0.15;
      else if (db < floor) floor = db;
      const loud = db > Math.max(floor + rise, ABS_MIN_DB);
      if (loud) {
        speechStarted = true;
        lastSpeechAt = t;
        return "wait";
      }
      if (!speechStarted) return elapsed >= opts.noSpeechMs ? "give-up" : "wait";
      return t - lastSpeechAt >= opts.silenceMs ? "stop" : "wait";
    },
  };
}

/** Kayıt süresinden tahmini tanıma maliyeti (saniye) — bütçeye yazılır. */
export function sttSeconds(durationMillis: number): number {
  return Math.max(1, Math.round(durationMillis / 1000));
}
