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

/** Gemini önceden tanımlı sesler (gemini-*-tts). Seçim ekranı için Türkçe not. */
export const GEMINI_VOICES: { id: string; label: string; note: string }[] = [
  { id: "Kore", label: "Kore", note: "kadın, kararlı" },
  { id: "Puck", label: "Puck", note: "erkek, neşeli" },
  { id: "Charon", label: "Charon", note: "erkek, açıklayıcı" },
  { id: "Zephyr", label: "Zephyr", note: "kadın, parlak" },
  { id: "Fenrir", label: "Fenrir", note: "erkek, coşkulu" },
  { id: "Leda", label: "Leda", note: "kadın, genç" },
  { id: "Orus", label: "Orus", note: "erkek, kararlı" },
  { id: "Aoede", label: "Aoede", note: "kadın, rahat" },
  { id: "Enceladus", label: "Enceladus", note: "erkek, nefesli" },
  { id: "Sulafat", label: "Sulafat", note: "kadın, sıcak" },
];
export const DEFAULT_GEMINI_VOICE = "Kore";

export type VoiceProvider = "device" | "openai" | "gemini";

export function voicesFor(provider: VoiceProvider): { id: string; label: string; note: string }[] {
  if (provider === "gemini") return GEMINI_VOICES;
  if (provider === "openai") return OPENAI_VOICES;
  return [];
}

/** Kullanıcının ses tercihi (profile.voice). */
export interface VoiceSettings {
  /**
   * "device" = telefonun TTS'i; "gemini" = Gemini ses modeli (ücretsiz kota);
   * "openai" = OpenAI ses modeli. İkisi de kendi anahtarını ister.
   */
  provider: VoiceProvider;
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
 * VARSAYILAN: DeepSeek beyin + GEMİNİ ses. Kullanıcının kararı: konuşmada
 * pahalı olan kısım beyin değil ses; Gemini'nin ücretsiz kotası sesi
 * sıfıra, DeepSeek beyni ≈ 1 TL/oturuma indiriyor. İkisi de ANAHTAR VARSA
 * devreye girer; yoksa oda sessizce aktif sağlayıcıya ve telefon sesine
 * düşer — Ayarlar bunu açıkça söyler.
 */
export const DEFAULT_VOICE: VoiceSettings = {
  provider: "gemini",
  voiceId: DEFAULT_GEMINI_VOICE,
  transcribe: true,
  brain: "deepseek",
};

/** Depodan gelen bozuk/eksik değer güvenli tercihe düşer. */
export function normalizeVoice(raw: unknown): VoiceSettings {
  const r = (raw ?? {}) as Partial<Record<keyof VoiceSettings, unknown>>;
  // Eksik alan varsayılana düşer; yalnız AÇIKÇA yazılmış tercih korunur.
  const provider: VoiceProvider =
    r.provider === "device" || r.provider === "openai" ? r.provider : "gemini";
  const list = voicesFor(provider);
  const fallback = provider === "openai" ? DEFAULT_OPENAI_VOICE : DEFAULT_GEMINI_VOICE;
  const voiceId =
    typeof r.voiceId === "string" && list.some((v) => v.id === r.voiceId) ? r.voiceId : fallback;
  const transcribe = typeof r.transcribe === "boolean" ? r.transcribe : DEFAULT_VOICE.transcribe;
  const brain = r.brain === "active" ? "active" : "deepseek";
  return { provider, voiceId, transcribe, brain };
}

/** Seçili ses sağlayıcısının anahtarı; telefon sesinde ya da anahtar yoksa "". */
export function voiceKeyFor(
  voice: VoiceSettings,
  keys: { openai?: string; gemini?: string }
): string {
  if (voice.provider === "gemini") return (keys.gemini ?? "").trim();
  if (voice.provider === "openai") return (keys.openai ?? "").trim();
  return "";
}

/**
 * Ses modeli kullanılabilir mi: tercih telefon değil VE o sağlayıcının
 * anahtarı var. Anahtarsız tercih sessizce telefona düşer — kullanıcıya bunu
 * Ayarlar söyler. `key` = seçili sağlayıcının anahtarı (bkz. voiceKeyFor).
 */
export function neuralVoiceActive(voice: VoiceSettings, key: string | undefined): boolean {
  return voice.provider !== "device" && !!key?.trim();
}

export function neuralTranscribeActive(voice: VoiceSettings, key: string | undefined): boolean {
  return neuralVoiceActive(voice, key) && voice.transcribe;
}

// ---------------------------------------------------------------------------
// Ham PCM → WAV (Gemini TTS ham 16 bit PCM döndürür; oynatıcı başlık ister)
// ---------------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i += 1) B64_LOOKUP[B64[i]] = i;

/** base64 → bayt. Bağımlılık yok; Hermes'te atob her sürümde güvenilir değil. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64_LOOKUP[ch];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** "audio/L16;codec=pcm;rate=24000" → 24000; belirsizse Gemini'nin varsayılanı. */
export function pcmRateFromMime(mime: string | undefined): number {
  const m = /rate=(\d+)/.exec(mime ?? "");
  return m ? Number(m[1]) : 24000;
}

/** 16 bit mono PCM'i 44 baytlık WAV başlığıyla sarar. */
export function wavFromPcm16(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (off: number, t: string) => {
    for (let i = 0; i < t.length; i += 1) v.setUint8(off + i, t.charCodeAt(i));
  };
  const channels = 1;
  const bytesPerSample = 2;
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // fmt boyutu
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * bytesPerSample, true);
  v.setUint16(32, channels * bytesPerSample, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
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
