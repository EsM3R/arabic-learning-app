/**
 * Sinir ağı sesi — saf mantık.
 *
 * En kritik parça sessizlik kapısı: kayıt tabanlı dinlemede "öğrenci sustu"
 * kararı ses düzeyinden veriliyor. Eşik yanlışsa ekran çökmez — ya öğrenci
 * daha cümlesini bitirmeden sıra geçer (kesilme) ya da sustuktan sonra
 * saniyelerce bekler (donma). İkisi de "konuşma hissi"ni öldürür ve ikisini
 * de yalnız test yakalar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  base64ToBytes,
  cleanForSpeech,
  createSilenceGate,
  DEFAULT_VOICE,
  GEMINI_VOICES,
  neuralTranscribeActive,
  neuralVoiceActive,
  normalizeVoice,
  OPENAI_VOICES,
  pcmRateFromMime,
  sttSeconds,
  voiceKeyFor,
  wavFromPcm16,
} from "../src/voice.ts";

const GATE = { silenceMs: 2000, noSpeechMs: 8000, maxMs: 45_000 };

test("konuşma başlamadan sessizlik sayacı ÇALIŞMAZ", () => {
  const g = createSilenceGate(GATE);
  for (let t = 0; t < 7000; t += 150) assert.equal(g.sample(t, -60), "wait");
  assert.equal(g.speechStarted, false);
});

test("hiç konuşulmazsa vazgeçilir — boş dosya ses modeline gitmesin", () => {
  const g = createSilenceGate(GATE);
  let v = "wait";
  for (let t = 0; t <= 8200; t += 150) v = g.sample(t, -60);
  assert.equal(v, "give-up");
});

test("taban ÖĞRENİLİR: gürültülü odada konuşma yine ayırt edilir", () => {
  // Sabit eşik olsaydı -52 dB'lik bir klima uğultusu tabanı bozardı.
  const g = createSilenceGate(GATE);
  for (let t = 0; t < 1500; t += 150) assert.equal(g.sample(t, -52), "wait"); // klima
  assert.equal(g.speechStarted, false);
  g.sample(1650, -20); // konuşma: tabanın 30 dB üstü
  assert.equal(g.speechStarted, true);
});

test("HEMEN konuşmaya başlayan öğrenci de algılanır — taban konuşmadan öğrenilmez", () => {
  // Gerçek hata: taban 'görülen en düşük değer' olunca ilk örnek konuşmanın
  // kendisiydi ve konuşma hiç başlamış sayılmıyordu.
  const g = createSilenceGate(GATE);
  g.sample(0, -20);
  assert.equal(g.speechStarted, true);
});

test("konuştuktan sonra 2 sn sessizlik → DUR, daha erken değil", () => {
  const g = createSilenceGate(GATE);
  g.sample(0, -60);
  g.sample(150, -20); // konuşma
  g.sample(1000, -20);
  assert.equal(g.sample(2500, -60), "wait"); // 1,5 sn sessiz: henüz
  assert.equal(g.sample(2900, -60), "wait");
  assert.equal(g.sample(3050, -60), "stop"); // 2,05 sn sessiz
});

test("düşünme duraksaması sayacı SIFIRLAR — cümle ortasında kesilme olmasın", () => {
  const g = createSilenceGate(GATE);
  g.sample(0, -60);
  g.sample(150, -20);
  g.sample(1500, -60); // 1,35 sn duraksadı
  g.sample(1650, -20); // devam etti
  assert.equal(g.sample(3000, -60), "wait"); // son konuşmadan 1,35 sn
  assert.equal(g.sample(3700, -60), "stop");
});

test("üst sınırda durur: konuştuysa DUR, konuşmadıysa vazgeç", () => {
  const spoke = createSilenceGate(GATE);
  spoke.sample(0, -60);
  spoke.sample(150, -20);
  assert.equal(spoke.sample(45_000, -20), "stop");
  const silent = createSilenceGate(GATE);
  silent.sample(0, undefined);
  assert.equal(silent.sample(45_000, undefined), "give-up");
});

test("metering gelmeyen cihazda çökmez, üst sınırlara güvenir", () => {
  const g = createSilenceGate(GATE);
  for (let t = 0; t < 5000; t += 150) assert.equal(g.sample(t, undefined), "wait");
});

test("VARSAYILAN: DeepSeek beyin + GEMİNİ ses (ücretsiz kota) — kullanıcının kararı", () => {
  assert.equal(DEFAULT_VOICE.provider, "gemini");
  assert.equal(DEFAULT_VOICE.brain, "deepseek");
  assert.equal(DEFAULT_VOICE.transcribe, true);
  assert.deepEqual(normalizeVoice(undefined), DEFAULT_VOICE);
  assert.ok(GEMINI_VOICES.some((v) => v.id === DEFAULT_VOICE.voiceId));
});

test("ses tercihi: bozuk alan varsayılana düşer, AÇIK seçim korunur", () => {
  assert.deepEqual(normalizeVoice({ provider: "gemini", voiceId: "uydurma", transcribe: "evet" }), {
    provider: "gemini",
    voiceId: DEFAULT_VOICE.voiceId,
    transcribe: DEFAULT_VOICE.transcribe,
    brain: "deepseek",
  });
  assert.deepEqual(
    normalizeVoice({ provider: "openai", voiceId: "nova", transcribe: false, brain: "active" }),
    { provider: "openai", voiceId: "nova", transcribe: false, brain: "active" }
  );
  assert.ok(OPENAI_VOICES.some((v) => v.id === "nova"));
});

test("sağlayıcı değişince ses adı öbür sağlayıcıya SIZMAZ", () => {
  // "Kore" OpenAI'da yok: sızsaydı istek 400 döner, telefon sesine düşerdi.
  assert.equal(normalizeVoice({ provider: "openai", voiceId: "Kore" }).voiceId, "ash");
  assert.equal(normalizeVoice({ provider: "gemini", voiceId: "nova" }).voiceId, "Kore");
});

test("ses modeli yalnız KENDİ anahtarı varsa etkin — yoksa sessizce telefona düşer", () => {
  const g = normalizeVoice({ provider: "gemini", voiceId: "Kore", transcribe: true });
  assert.equal(voiceKeyFor(g, { gemini: " g ", openai: "o" }), "g");
  assert.equal(voiceKeyFor(g, { openai: "o" }), ""); // OpenAI anahtarı Gemini'ye yaramaz
  assert.equal(neuralVoiceActive(g, "g"), true);
  assert.equal(neuralVoiceActive(g, ""), false);
  assert.equal(neuralTranscribeActive(g, "g"), true);
  assert.equal(neuralTranscribeActive({ ...g, transcribe: false }, "g"), false);
  const d = normalizeVoice({ provider: "device" });
  assert.equal(voiceKeyFor(d, { gemini: "g", openai: "o" }), "");
  assert.equal(neuralVoiceActive(d, "g"), false);
});

// --- ham PCM → WAV (Gemini TTS) ----------------------------------------------

test("base64 doğru çözülür", () => {
  assert.deepEqual(Array.from(base64ToBytes("AQID")), [1, 2, 3]);
  assert.deepEqual(Array.from(base64ToBytes("AQ==")), [1]);
  assert.deepEqual(Array.from(base64ToBytes("AQI=")), [1, 2]);
});

test("WAV başlığı doğru: RIFF, 16 bit mono, örnekleme hızı ve veri boyutu", () => {
  // Yanlış başlıkla oynatıcı ya hiç çalmaz ya gürültü çalar — ekran çökmez.
  const pcm = Uint8Array.from([0, 0, 255, 127]);
  const wav = wavFromPcm16(pcm, 24000);
  const v = new DataView(wav.buffer);
  const tag = (o: number) => String.fromCharCode(wav[o], wav[o + 1], wav[o + 2], wav[o + 3]);
  assert.equal(wav.length, 44 + 4);
  assert.equal(tag(0), "RIFF");
  assert.equal(tag(8), "WAVE");
  assert.equal(v.getUint16(20, true), 1); // PCM
  assert.equal(v.getUint16(22, true), 1); // mono
  assert.equal(v.getUint32(24, true), 24000);
  assert.equal(v.getUint32(28, true), 48000); // bayt/sn
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(tag(36), "data");
  assert.equal(v.getUint32(40, true), 4);
  assert.deepEqual(Array.from(wav.slice(44)), [0, 0, 255, 127]);
});

test("örnekleme hızı mime'dan okunur, yoksa 24 kHz", () => {
  assert.equal(pcmRateFromMime("audio/L16;codec=pcm;rate=16000"), 16000);
  assert.equal(pcmRateFromMime(undefined), 24000);
});

test("sese giden metinden okunuş parantezi, madde ve emoji temizlenir, HAREKE kalır", () => {
  const out = cleanForSpeech("- **أَهْلاً** (ehlen) 😊 nasılsın?");
  assert.equal(out, "أَهْلاً nasılsın?");
});

test("sayısal parantez temizlenmez — '(3)' bir okunuş değil", () => {
  assert.equal(cleanForSpeech("Toplam (3) kişi."), "Toplam (3) kişi.");
});

test("tanıma süresi en az 1 saniye sayılır", () => {
  assert.equal(sttSeconds(0), 1);
  assert.equal(sttSeconds(2600), 3);
});
