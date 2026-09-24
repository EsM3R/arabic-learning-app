/**
 * OpenAI SES KATMANI — sentez (TTS) ve tanıma (STT), cihaz tarafı.
 *
 * ChatGPT'nin "akıcı konuşması" sunucudaki ses modelinden gelir; burada aynı
 * modele doğrudan gidiliyor. Ham fetch kullanılıyor, SDK değil: ses uçları
 * ikili gövde döndürür ve çok parçalı dosya ister; RN'de SDK'nın bu iki yolu
 * güvenilir değil, Expo'nun fetch'i ise ikisini de destekliyor.
 *
 * Maliyet, sohbetle aynı sayaca yazılır (openai-tts / openai-stt sahte model
 * adlarıyla) — böylece harcama tavanı sesi de kapsar. Ses konuşmadan ayrı
 * bir fatura değildir.
 */
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { getActivePack } from "./languages";
import { cleanForSpeech, STT_MODEL, TTS_MODEL } from "./voice";
import { speakTarget, stopSpeaking } from "./speech";
import type { SpeechQueue } from "./speech";
import { recordUsage } from "./usage";

const API = "https://api.openai.com/v1";

async function errorText(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Metni sese çevirir; mp3 baytları döner. */
export async function synthesize(
  apiKey: string,
  text: string,
  voiceId: string
): Promise<Uint8Array> {
  const input = cleanForSpeech(text);
  const pack = getActivePack();
  const res = await expoFetch(`${API}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: voiceId,
      input,
      response_format: "mp3",
      // Dil ve karakter yönergesi: model aksanı ve tonu buna göre kurar.
      instructions: `Speak in ${pack.label} (${pack.ttsLocale}) as a warm, natural native speaker in a relaxed conversation. Natural pace, natural intonation; no reading voice.`,
    }),
  });
  if (!res.ok) throw new Error(`Ses üretilemedi: ${await errorText(res)}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  void recordUsage({ model: "openai-tts", input: input.length, output: 0 });
  return bytes;
}

/** Ses dosyasını yazıya çevirir. */
export async function transcribe(
  apiKey: string,
  fileUri: string,
  language: string,
  durationSeconds: number
): Promise<string> {
  const file = new File(fileUri);
  const form = new FormData();
  form.append("model", STT_MODEL);
  form.append("language", language);
  form.append("response_format", "json");
  // Expo'nun FormData dönüştürücüsü `bytes()` sunan nesneleri dosya sayar.
  form.append(
    "file",
    { name: "kayit.m4a", type: "audio/m4a", bytes: () => file.bytes() } as unknown as Blob
  );
  const res = await expoFetch(`${API}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Ses çözülemedi: ${await errorText(res)}`);
  const j = (await res.json()) as { text?: string };
  void recordUsage({ model: "openai-stt", input: durationSeconds, output: 0 });
  return (j.text ?? "").trim();
}

let clipSeq = 0;

/** Baytları önbelleğe yazıp çalar; bitince çözülür. */
function playBytes(bytes: Uint8Array): Promise<void> {
  clipSeq += 1;
  const file = new File(Paths.cache, `hoca-${clipSeq}.mp3`);
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
      setTimeout(finish, 3000 + bytes.length / 2);
    } catch {
      finish();
    }
  });
}

/**
 * Ses modeliyle çalışan konuşma kuyruğu — createSpeechQueue ile aynı arayüz.
 *
 * Boru hattı: N. cümle çalarken N+1 SENTEZLENİR. Sentez ~0,5-1 sn sürer;
 * sıralı yapılsaydı her cümle arasında o kadar boşluk olurdu ve "akıcı"
 * hissi yine kaçardı. Bir cümlenin sentezi düşerse o cümle telefonun TTS'iyle
 * okunur — sessizlik yerine robot ses, ama cümle kaybolmaz.
 */
export function createNeuralSpeechQueue(opts: {
  apiKey: string;
  voiceId: string;
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
    audio: synthesize(opts.apiKey, text, opts.voiceId).catch((e: unknown) => {
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
      await playBytes(bytes);
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

/** Ayarlar'daki "Sesi dene": tek cümle sentezle ve çal. */
export async function previewVoice(apiKey: string, voiceId: string, text: string): Promise<void> {
  const bytes = await synthesize(apiKey, text, voiceId);
  await playBytes(bytes);
}
