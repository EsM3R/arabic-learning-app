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
  cleanForSpeech,
  createSilenceGate,
  DEFAULT_VOICE,
  neuralTranscribeActive,
  neuralVoiceActive,
  normalizeVoice,
  OPENAI_VOICES,
  sttSeconds,
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

test("ses tercihi: bozuk kayıt telefona düşer, geçerli seçim korunur", () => {
  assert.deepEqual(normalizeVoice(undefined), DEFAULT_VOICE);
  assert.deepEqual(normalizeVoice({ provider: "openai", voiceId: "uydurma", transcribe: "evet" }), {
    provider: "openai",
    voiceId: DEFAULT_VOICE.voiceId,
    transcribe: false,
  });
  assert.deepEqual(normalizeVoice({ provider: "openai", voiceId: "nova", transcribe: true }), {
    provider: "openai",
    voiceId: "nova",
    transcribe: true,
  });
  assert.ok(OPENAI_VOICES.some((v) => v.id === DEFAULT_VOICE.voiceId));
});

test("ses modeli yalnız ANAHTAR VARSA etkin — yoksa sessizce telefona düşer", () => {
  const v = normalizeVoice({ provider: "openai", voiceId: "ash", transcribe: true });
  assert.equal(neuralVoiceActive(v, "sk-abc"), true);
  assert.equal(neuralVoiceActive(v, ""), false);
  assert.equal(neuralVoiceActive(v, undefined), false);
  assert.equal(neuralTranscribeActive(v, "sk-abc"), true);
  assert.equal(neuralTranscribeActive({ ...v, transcribe: false }, "sk-abc"), false);
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
