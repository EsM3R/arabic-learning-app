/** Akıcılık alıştırması (4/3/2) mantığı testleri. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterRound,
  baseSeconds,
  fluencyOutcome,
  fluencyTrend,
  GOOD_GAIN,
  KEEP_SESSIONS,
  makeRound,
  pruneSessions,
  roundSeconds,
  speechRate,
  wordCount,
} from "../src/fluency.ts";
import type { FluencySession } from "../src/fluency.ts";

test("süreler seviyeyle büyür ama 4/3/2 oranı korunur", () => {
  for (const level of ["A0", "A1", "A2", "B1", "B2", "C1"]) {
    const [a, b, c] = roundSeconds(level);
    assert.ok(a > b && b > c, `${level}: süreler azalmıyor`);
    assert.equal(b, Math.round(a * 0.75));
    assert.equal(c, Math.round(a * 0.5));
  }
});

test("başlangıç seviyesinde 4 dakika DAYATILMAZ", () => {
  // A1'de kimse 4 dakika kesintisiz konuşamaz; klasik süre orada akıcılık
  // değil utanç üretir. Süre seviyeyle gelir.
  assert.ok(baseSeconds("A1") <= 60);
  assert.ok(baseSeconds("B1") > baseSeconds("A1"));
  assert.equal(baseSeconds("C1"), 240); // klasik 4 dakika en üstte
});

test("kelime sayımı noktalama ve işaretleri saymaz", () => {
  assert.equal(wordCount("Bonjour, je m'appelle Marc.", "latin"), 4); // kesme BAĞLAR
  assert.equal(wordCount("Dell'arte è una cosa", "latin"), 4);
  assert.equal(wordCount("رَحَلْتُ إلى السوق", "arabic"), 3);
  assert.equal(wordCount("Я иду в шко́лу", "cyrillic"), 4);
  assert.equal(wordCount("", "latin"), 0);
  assert.equal(wordCount("   ", "latin"), 0);
});

test("hız hesabı ve sıfır süreye karşı koruma", () => {
  assert.equal(speechRate(60, 60), 60);
  assert.equal(speechRate(30, 120), 15);
  assert.equal(speechRate(10, 0), 0); // sıfıra bölme = çökme
});

test("hızlanma yakalanır ve yüzdeyle söylenir", () => {
  const o = fluencyOutcome([makeRound(60, 60), makeRound(55, 45), makeRound(50, 30)]);
  // 60 wpm → 73 wpm → 100 wpm
  assert.equal(o.measured, true);
  assert.ok(o.gain > GOOD_GAIN, `kazanç: ${o.gain}`);
  assert.match(o.message, /daha hızlı anlattın/);
});

test("yavaşlama gizlenmez ve sebebi söylenir", () => {
  const o = fluencyOutcome([makeRound(80, 60), makeRound(30, 45), makeRound(15, 30)]);
  assert.ok(o.gain < 0);
  assert.match(o.message, /yavaşladın/);
  assert.match(o.message, /AKIŞ/);
});

test("ölçüm yapılamadıysa UYDURULMAZ", () => {
  // Öğrenciye yalan söyleyen gösterge bu uygulamanın en kaçındığı şey.
  const o = fluencyOutcome([makeRound(0, 60), makeRound(0, 45), makeRound(0, 30)]);
  assert.equal(o.measured, false);
  assert.equal(o.gain, 0);
  assert.match(o.message, /ölçülemedi/);
  assert.doesNotMatch(o.message, /hızlandın/);
});

test("tek turda ölçüm yapılmış sayılmaz", () => {
  assert.equal(fluencyOutcome([makeRound(40, 60)]).measured, false);
});

test("sessiz tur ölçümü bozmaz — duyulan turlar karşılaştırılır", () => {
  const o = fluencyOutcome([makeRound(50, 60), makeRound(0, 45), makeRound(45, 30)]);
  assert.equal(o.measured, true);
  assert.equal(o.firstWpm, 50);
  assert.equal(o.lastWpm, 90);
});

function session(at: string, lastWpm: number): FluencySession {
  return {
    id: at,
    at,
    topic: "pazar",
    level: "A2",
    rounds: [makeRound(40, 60), makeRound(lastWpm / 2, 30)],
  };
}

test("eğilim: ilk oturumda kıyas yapılmaz", () => {
  const t = fluencyTrend([session("2026-09-01T10:00:00.000Z", 60)]);
  assert.equal(t?.sessions, 1);
  assert.equal(t?.previousAvgWpm, null);
});

test("eğilim: en yeni oturum öncekilerin ortalamasıyla kıyaslanır", () => {
  const t = fluencyTrend([
    session("2026-09-01T10:00:00.000Z", 40),
    session("2026-09-05T10:00:00.000Z", 60),
    session("2026-09-03T10:00:00.000Z", 50),
  ]);
  assert.equal(t?.sessions, 3);
  assert.equal(t?.latestWpm, 60); // en yeni: 05 Eylül
  assert.equal(t?.previousAvgWpm, 45); // (40 + 50) / 2
});

test("eğilim: kayıt yoksa null", () => {
  assert.equal(fluencyTrend([]), null);
});

test("kütüphane budanır ve en yeniler kalır", () => {
  const many = Array.from({ length: KEEP_SESSIONS + 10 }, (_, i) =>
    session(`2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`, 40 + i)
  );
  const kept = pruneSessions(many);
  assert.equal(kept.length, KEEP_SESSIONS);
  const times = kept.map((s) => Date.parse(s.at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});


// ---------------------------------------------------------------------------
// Tur sıralaması — GERÇEK bir hatanın nöbetçisi
// ---------------------------------------------------------------------------

test("ara turdan sonra 'arada', SON turdan sonra 'sonuc'", () => {
  // Ekranda bu karar bayat bir index'le veriliyordu: son tur bittiğinde
  // sonuç ekranı hiç açılmıyor, olmayan bir 4. tura geçiliyordu.
  assert.deepEqual(afterRound(0, 3), { stage: "arada", next: 1 });
  assert.deepEqual(afterRound(1, 3), { stage: "arada", next: 2 });
  assert.deepEqual(afterRound(2, 3), { stage: "sonuc", next: null });
});

test("sınır dışı tur numarası oturumu BİTİRİR, ileri sarmaz", () => {
  assert.deepEqual(afterRound(3, 3), { stage: "sonuc", next: null });
  assert.deepEqual(afterRound(99, 3), { stage: "sonuc", next: null });
  assert.deepEqual(afterRound(-1, 3), { stage: "sonuc", next: null });
});

test("tek turluk planda ilk tur zaten sonuncudur", () => {
  assert.deepEqual(afterRound(0, 1), { stage: "sonuc", next: null });
});

test("sıralama plan uzunluğunu ASLA aşmaz", () => {
  const plan = roundSeconds("A2");
  let i = 0;
  const gorulen = [i];
  for (let guard = 0; guard < 10; guard++) {
    const t = afterRound(i, plan.length);
    if (t.next === null) break;
    i = t.next;
    gorulen.push(i);
  }
  assert.deepEqual(gorulen, [0, 1, 2]);
  assert.ok(gorulen.every((x) => x < plan.length));
});
