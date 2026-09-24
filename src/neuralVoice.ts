/**
 * SİNİR AĞI SESİ — sağlayıcıdan bağımsız katman (cihaz tarafı).
 *
 * İki arka uç var: Gemini (ücretsiz kota, varsayılan) ve OpenAI. İkisi de
 * aynı iki işi yapar — metni sese çevir, sesi metne çevir — ve Konuşma Odası
 * hangisinin arkada olduğunu bilmez. Kuyruk, oynatıcı ve "hangi arka uç"
 * kararı burada; sağlayıcıya özgü istekler geminiVoice.ts / openaiVoice.ts'te.
 *
 * Boru hattı: N. cümle çalarken N+1 SENTEZLENİR. Sentez ~0,5-1 sn sürer;
 * sıralı yapılsaydı her cümle arasında o kadar boşluk olurdu ve "akıcı"
 * hissi kaçardı. Bir cümlenin sentezi düşerse o cümle telefonun TTS'iyle
 * okunur — sessizlik yerine robot ses, ama cümle kaybolmaz.
 */
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { geminiBackend } from "./geminiVoice";
import { openaiBackend } from "./openaiVoice";
import { speakTarget, stopSpeaking } from "./speech";
import type { SpeechQueue } from "./speech";
import { voiceKeyFor } from "./voice";
import type { VoiceSettings } from "./voice";

export interface VoiceBackend {
  /** Ekranda görünen ad ("Gemini Kore"). */
  label: string;
  /** Metni sese çevirir; çalınabilir dosya baytları (mp3 ya da wav). */
  synthesize: (text: string) => Promise<Uint8Array>;
  /** Dosya uzantısı — oynatıcı biçimi buradan anlar. */
  ext: "mp3" | "wav";
  /** Ses dosyasını yazıya çevirir. */
  transcribe: (fileUri: string, language: string, durationSeconds: number) => Promise<string>;
}

/**
 * Tercih + anahtarlardan arka uç. Anahtar yoksa null: Konuşma Odası o zaman
 * telefon sesine ve telefon tanımasına düşer, ekran bunu yazar.
 */
export function backendFor(
  voice: VoiceSettings,
  keys: { openai?: string; gemini?: string }
): VoiceBackend | null {
  const key = voiceKeyFor(voice, keys);
  if (!key) return null;
  if (voice.provider === "gemini") return geminiBackend(key, voice.voiceId);
  if (voice.provider === "openai") return openaiBackend(key, voice.voiceId);
  return null;
}

let clipSeq = 0;

/** Baytları önbelleğe yazıp çalar; bitince çözülür. */
export function playBytes(bytes: Uint8Array, ext: "mp3" | "wav"): Promise<void> {
  clipSeq += 1;
  const file = new File(Paths.cache, `hoca-${clipSeq}.${ext}`);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return new Promise((resolve) => {
    let player: AudioPlayer | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        player?.remove();
      } catch {
        // oynatıcı zaten kapanmış olabilir
      }
      try {
        file.delete();
      } catch {
        // geçici dosya; kalsa da zararı yok
      }
      resolve();
    };
    try {
      player = createAudioPlayer({ uri: file.uri });
      player.addListener("playbackStatusUpdate", (s) => {
        if (s.didJustFinish) finish();
      });
      player.play();
      // Bekçi: durum olayı hiç gelmezse (bazı cihazlar) süreye göre bırak.
      // wav sıkıştırmasız (48 KB/sn), mp3 ~16 KB/sn: süre tahmini ona göre.
      const perMs = ext === "wav" ? 48 : 16;
      setTimeout(finish, 3000 + bytes.length / perMs);
    } catch {
      finish();
    }
  });
}

/** Ayarlar'daki "Sesi dene": tek cümle sentezle ve çal. */
export async function previewVoice(backend: VoiceBackend, text: string): Promise<void> {
  const bytes = await backend.synthesize(text);
  await playBytes(bytes, backend.ext);
}

/**
 * Ses modeliyle çalışan konuşma kuyruğu — createSpeechQueue ile aynı arayüz.
 */
export function createNeuralSpeechQueue(opts: {
  backend: VoiceBackend;
  onSentence?: (text: string) => void;
  onIdle?: () => void;
  onFallback?: (reason: string) => void;
}): SpeechQueue {
  type Item = { text: string; audio: Promise<Uint8Array | null> };
  const queue: Item[] = [];
  let busy = false;
  let finished = false;
  let cancelled = false;
  let cancelToken = 0;

  const prepare = (text: string): Item => ({
    text,
    audio: opts.backend.synthesize(text).catch((e: unknown) => {
      opts.onFallback?.(e instanceof Error ? e.message : String(e));
      return null;
    }),
  });

  const next = async () => {
    if (cancelled) return;
    const item = queue.shift();
    if (!item) {
      busy = false;
      if (finished) opts.onIdle?.();
      return;
    }
    busy = true;
    const token = cancelToken;
    opts.onSentence?.(item.text);
    const bytes = await item.audio;
    if (cancelled || token !== cancelToken) return;
    if (bytes) {
      await playBytes(bytes, opts.backend.ext);
    } else {
      // Yedek: telefon sesi — cümle kaybolmasın.
      await new Promise<void>((resolve) => {
        speakTarget(item.text);
        setTimeout(resolve, 1500 + item.text.length * 70);
      });
    }
    if (cancelled || token !== cancelToken) return;
    void next();
  };

  return {
    push: (sentence) => {
      if (cancelled || !sentence.trim()) return;
      queue.push(prepare(sentence)); // sentez hemen başlar (ön-getirme)
      if (!busy) void next();
    },
    finish: () => {
      finished = true;
      if (!busy && queue.length === 0 && !cancelled) opts.onIdle?.();
    },
    cancel: () => {
      cancelled = true;
      cancelToken += 1;
      queue.length = 0;
      busy = false;
      stopSpeaking();
    },
    get speaking() {
      return busy || queue.length > 0;
    },
  };
}
