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
 * bir fatura değildir. Kuyruk ve oynatıcı src/neuralVoice.ts'te.
 */
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { getActivePack } from "./languages";
import type { VoiceBackend } from "./neuralVoice";
import { cleanForSpeech, STT_MODEL, TTS_MODEL } from "./voice";
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

export function openaiBackend(apiKey: string, voiceId: string): VoiceBackend {
  return {
    label: `OpenAI ${voiceId}`,
    ext: "mp3",
    synthesize: (text) => synthesize(apiKey, text, voiceId),
    transcribe: (uri, lang, secs) => transcribe(apiKey, uri, lang, secs),
  };
}
