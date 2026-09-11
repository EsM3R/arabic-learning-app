/**
 * Hocaya giden HAFIZA bloğunun testleri.
 *
 * Bu blok, uygulamanın "agentic" iddiasının kanıtı: hoca her derse öğrencinin
 * geçmişiyle giriyor. Sessizce bozulursa kimse fark etmez — hoca sadece biraz
 * daha genel konuşur ve öğrenci aynı hatayı aylarca yapmaya devam eder.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryContext, retentionDigest } from "../src/prompts.ts";
import type { MistakeEntry, TeacherNote, VocabCard } from "../src/types.ts";

let seq = 0;
function mistake(over: Partial<MistakeEntry> = {}): MistakeEntry {
  seq += 1;
  return {
    id: `m${seq}`,
    topic: "geçmiş zaman",
    mistake: "yanlış",
    correction: "doğru",
    explanation: "çünkü",
    resolved: false,
    createdAt: "2026-09-01T10:00:00.000Z",
    timesSeen: 1,
    ...over,
  } as MistakeEntry;
}

function note(text: string): TeacherNote {
  seq += 1;
  return { id: `n${seq}`, note: text, createdAt: "2026-09-01T10:00:00.000Z" } as TeacherNote;
}

function card(over: Partial<VocabCard> = {}): VocabCard {
  seq += 1;
  return {
    id: `v${seq}`,
    arabic: "كلمة",
    transliteration: "kelime",
    turkish: "kelime",
    track: "okuma",
    addedAt: "2026-09-01T10:00:00.000Z",
    due: "2026-09-02T10:00:00.000Z",
    intervalDays: 1,
    ease: 2.5,
    reps: 1,
    lapses: 0,
    ...over,
  } as VocabCard;
}

test("hiç veri yoksa hafıza bloğu HİÇ yazılmaz", () => {
  // Boş başlık yazmak prompt'u şişirir ve modele "burada bir şey var" der.
  assert.equal(memoryContext([], []), "");
});

test("çözülmüş hatalar hafızaya girmez", () => {
  const out = memoryContext([mistake({ resolved: true, mistake: "kapanmış" })], []);
  assert.equal(out, "");
});

test("3+ kez görülen hata AYRI ve buyurgan bir başlıkta çıkar", () => {
  // Fosilleşen hata kenar notuyla geçilmez; ders içinde işlenmesi istenir.
  const out = memoryContext([mistake({ timesSeen: 4, mistake: "fosil" })], []);
  assert.match(out, /TEKRARLAYAN HATALAR/);
  assert.match(out, /EN AZ BİRİNİ açıkça işle/);
  assert.match(out, /4\. kez/);
  assert.match(out, /fosil/);
});

test("hata id'si hafızaya yazılır — hoca onu kapatabilsin", () => {
  // id olmadan hata_cozuldu aracı çağrılamaz ve hata defteri hiç boşalmaz.
  const m = mistake({ timesSeen: 5 });
  assert.match(memoryContext([m], []), new RegExp(`id=${m.id}`));
  const m2 = mistake({ timesSeen: 1 });
  assert.match(memoryContext([m2], []), new RegExp(`id=${m2.id}`));
});

test("açık hata listesi 10 ile sınırlı ve kalanı sayıyla bildirilir", () => {
  // Sınırsız liste prompt'u şişirir; ama "kalan var" bilgisi kaybolursa hoca
  // defterin tamamını gördüğünü sanır.
  const many = Array.from({ length: 25 }, () => mistake());
  const out = memoryContext(many, []);
  assert.match(out, /Kalan 15 hataya hafiza_oku/);
});

test("aktif parkurun hatası öne alınır", () => {
  const konusma = mistake({ track: "konusma", mistake: "SÖZLÜ-HATA" });
  const okuma = mistake({ track: "okuma", mistake: "YAZILI-HATA" });
  const out = memoryContext([okuma, konusma], [], "konusma");
  assert.ok(
    out.indexOf("SÖZLÜ-HATA") < out.indexOf("YAZILI-HATA"),
    "aktif parkurun hatası öne alınmamış"
  );
});

test("hoca notlarının yalnız SON 6'sı taşınır", () => {
  const notes = Array.from({ length: 10 }, (_, i) => note(`not-${i}`));
  const out = memoryContext([], notes);
  assert.match(out, /not-9/);
  assert.match(out, /not-4/);
  assert.doesNotMatch(out, /not-3\b/);
});

test("tekrar özeti boş defterde sessiz kalır", () => {
  assert.equal(retentionDigest([]), "");
});

test("tekrar özeti kart sayısını ve zorlananları bildirir", () => {
  const cards = [
    card(),
    card({ lapses: 4, turkish: "zor-kelime" }),
    card({ lapses: 5, turkish: "çok-zor" }),
  ];
  const out = retentionDigest(cards);
  assert.ok(out.length > 0);
  assert.match(out, /3/); // defterdeki kart sayısı
});

test("hafıza bloğu başlıkla başlar — prompt'ta karışmasın", () => {
  const out = memoryContext([mistake()], [note("bir not")]);
  assert.match(out, /HAFIZA:/);
  assert.ok(out.startsWith("\n\n"), "blok öncesi boşluk yok, önceki metne yapışır");
});
