/**
 * GEMİNİ SES ARKA UCU — sentez ve tanıma (cihaz tarafı).
 *
 * Kullanıcının tercihi: Gemini'nin ücretsiz kotası var, ses oradan gelsin.
 * REST ile gidiliyor (SDK değil): TTS ve ses girişi için SDK'nın RN'deki
 * davranışı belirsiz, REST ise düz JSON.
 *
 * TTS cevabı MP3 değil, HAM PCM (16 bit, 24 kHz, mono, base64). Oynatıcı ham
 * PCM çalamaz; wav başlığı sarılır (src/voice.ts wavFromPcm16). Tanıma için
 * ayrı bir uç yok: kayıt dosyası flash modele ses girişi olarak verilir ve
 * "yalnız yazıya dök" denir.
 *
 * DÜRÜST NOT: model adları hızlı değişiyor. TTS modeli tek sabitte
 * (GEMINI_TTS_MODEL); 404 gelirse hata metni model adını içerir ki
 * değiştirmek tek satır olsun.
 */
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { getActivePack } from "./languages";
import type { VoiceBackend } from "./neuralVoice";
import { recordUsage } from "./usage";
import { base64ToBytes, cleanForSpeech, pcmRateFromMime, wavFromPcm16 } from "./voice";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
/** Tanıma için çok kipli flash model — uygulamanın sohbette kullandığıyla aynı aile. */
export const GEMINI_STT_MODEL = "gemini-3.7-flash";

async function errorText(res: Response, what: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return `${what}: ${j.error?.message ?? `HTTP ${res.status}`}`;
  } catch {
    return `${what}: HTTP ${res.status}`;
  }
}

interface GenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
}

export async function synthesizeGemini(
  apiKey: string,
  text: string,
  voiceName: string
): Promise<Uint8Array> {
  const input = cleanForSpeech(text);
  const pack = getActivePack();
  const res = await expoFetch(`${API}/${GEMINI_TTS_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              // Yönerge metnin önüne konur: model tonu ve dili buradan alır.
              text: `Speak the following in ${pack.label} (${pack.ttsLocale}) as a warm, natural native speaker in a relaxed conversation — natural pace, natural intonation, not a reading voice:\n${input}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    }),
  });
  if (!res.ok) throw new Error(await errorText(res, `Ses üretilemedi (${GEMINI_TTS_MODEL})`));
  const j = (await res.json()) as GenerateResponse;
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const data = part?.inlineData?.data;
  if (!data) throw new Error("Ses üretilemedi: cevapta ses yok.");
  const pcm = base64ToBytes(data);
  const rate = pcmRateFromMime(part?.inlineData?.mimeType);
  void recordUsage({ model: "gemini-tts", input: input.length, output: 0 });
  return wavFromPcm16(pcm, rate);
}

export async function transcribeGemini(
  apiKey: string,
  fileUri: string,
  language: string,
  durationSeconds: number
): Promise<string> {
  const file = new File(fileUri);
  const data = await file.base64();
  const res = await expoFetch(`${API}/${GEMINI_STT_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inlineData: { mimeType: "audio/mp4", data } },
            {
              text: `Transcribe this audio verbatim. The speaker is a language learner speaking ${language} (ISO 639-1). Output ONLY the transcription in the original language and script, no translation, no commentary. If nothing intelligible is said, output an empty string.`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(await errorText(res, "Ses çözülemedi"));
  const j = (await res.json()) as GenerateResponse;
  const text = (j.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  void recordUsage({ model: "gemini-stt", input: durationSeconds, output: 0 });
  return text;
}

export function geminiBackend(apiKey: string, voiceName: string): VoiceBackend {
  return {
    label: `Gemini ${voiceName}`,
    ext: "wav",
    synthesize: (text) => synthesizeGemini(apiKey, text, voiceName),
    transcribe: (uri, lang, secs) => transcribeGemini(apiKey, uri, lang, secs),
  };
}
