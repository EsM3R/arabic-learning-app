/**
 * Gemini ses arka ucu — kullanıcının tercihi (ücretsiz kota).
 *
 * Gemini TTS mp3 değil HAM PCM döndürür; oynatıcı ham PCM çalamaz. Bu yüzden
 * ölçülen şey "istek atıldı mı" değil, dönen sesin ÇALINABİLİR biçime
 * çevrildiği (wav başlığı). Bir de tanıma: dosya, flash modele ses girişi
 * olarak gidiyor — ayrı uç yok.
 */
import { geminiBackend, GEMINI_TTS_MODEL, synthesizeGemini, transcribeGemini } from "../src/geminiVoice";
import { setActiveLanguage } from "../src/languages";
import { usageSummary } from "../src/usage";

const mockFetch = jest.fn();
jest.mock("expo/fetch", () => ({ fetch: (...a: unknown[]) => mockFetch(...a) }));
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  mockFetch.mockReset();
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

test("TTS: ham PCM base64 gelir, WAV olarak döner, maliyet yazılır", async () => {
  mockFetch.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: "AQID" } }] } },
      ],
    }),
  }));
  const wav = await synthesizeGemini("g-key", "مرحبا", "Kore");
  expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe("RIFF");
  expect(wav.length).toBe(44 + 3);
  const [url, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
  expect(url).toMatch(new RegExp(`${GEMINI_TTS_MODEL}:generateContent`));
  expect(init.headers["x-goog-api-key"]).toBe("g-key");
  const body = JSON.parse(init.body);
  expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
  expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");
  expect(body.contents[0].parts[0].text).toMatch(/Arapça/);
  await flush();
  expect((await usageSummary()).todayCalls).toBe(1);
});

test("TTS hatası MODEL ADINI söyler — ad değişirse tek satırlık düzeltme", async () => {
  mockFetch.mockImplementation(async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: { message: "model not found" } }),
  }));
  await expect(synthesizeGemini("g-key", "x", "Kore")).rejects.toThrow(
    new RegExp(`${GEMINI_TTS_MODEL}.*model not found`)
  );
});

test("cevapta ses yoksa anlaşılır hata", async () => {
  mockFetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [] }) }));
  await expect(synthesizeGemini("g-key", "x", "Kore")).rejects.toThrow(/cevapta ses yok/);
});

test("tanıma: kayıt base64 ses girişi olarak gider, metin temiz döner", async () => {
  const fs = (global as unknown as { __fs: Map<string, unknown> }).__fs;
  fs.set("file:///rec.m4a", new Uint8Array([1, 2, 3]));
  mockFetch.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: " البيت كبير \n" }] } }] }),
  }));
  const text = await transcribeGemini("g-key", "file:///rec.m4a", "ar", 5);
  expect(text).toBe("البيت كبير");
  const [, init] = mockFetch.mock.calls[0] as [string, { body: string }];
  const body = JSON.parse(init.body);
  expect(body.contents[0].parts[0].inlineData.mimeType).toBe("audio/mp4");
  expect(body.contents[0].parts[1].text).toMatch(/verbatim/);
  expect(body.contents[0].parts[1].text).toMatch(/\bar\b/);
});

test("arka uç etiketi ve biçimi doğru", () => {
  const b = geminiBackend("g-key", "Puck");
  expect(b.label).toBe("Gemini Puck");
  expect(b.ext).toBe("wav");
});
