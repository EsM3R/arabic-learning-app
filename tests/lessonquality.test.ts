/**
 * Dersin kendisini ölçmek.
 *
 * Uygulamadaki bütün ölçüm öğrenciye bakıyordu; hocaya hiç bakılmıyordu.
 * Oysa uygulamanın tamamı "model iyi ders anlatıyor" varsayımına dayanıyor
 * ve o varsayımın hiçbir ölçüsü yoktu. Kötü ders ile iyi ders ekranda
 * birbirinin aynı görünür: ikisinde de balonlar dolar, sayaçlar artar.
 *
 * Bu dosyada iki şey ölçülüyor: sayılar doğru mu, ve sayılardan çıkan hüküm
 * ADİL mi. İkincisi en az birincisi kadar önemli — yanlış alarm veren bir
 * ölçüm, hiç ölçmemekten daha kötüdür, çünkü hocayı olmayan bir kusuru
 * düzeltmeye zorlar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeLesson,
  averageQuality,
  expectedTargetRatio,
  isTurkishSentence,
  KEEP_QUALITY,
  lessonFindings,
  lessonQualityDigest,
  MIN_TURNS_FOR_VERDICT,
  pruneQuality,
  targetPortion,
} from "../src/lessonquality.ts";
import type { LessonQuality } from "../src/lessonquality.ts";
import type { ChatMessage } from "../src/types.ts";

const hoca = (content: string): ChatMessage => ({ role: "assistant", content });
const ogrenci = (content: string): ChatMessage => ({ role: "user", content });

/** Hüküm verilebilecek en az tur sayısını dolduran dolgu. */
function pad(msg: ChatMessage, n = MIN_TURNS_FOR_VERDICT): ChatMessage[] {
  return Array.from({ length: n }, () => msg);
}

// --- dil ayırma -------------------------------------------------------------

test("Arap yazısında ayrım KESİNDİR — yazının kendisinden gelir", () => {
  assert.equal(isTurkishSentence("البيت كبير", "arabic"), false);
  assert.equal(isTurkishSentence("Bu cümlede ev büyük demek", "arabic"), true);
});

test("Kiril ve Fars yazısı da kesin ayrılır", () => {
  assert.equal(isTurkishSentence("Дом большой", "cyrillic"), false);
  assert.equal(isTurkishSentence("خانه بزرگ است", "persian"), false);
});

test("Latin hedef dilde TÜRKÇEYE ÖZGÜ harf belirleyicidir", () => {
  // ğ, ı, ş sekiz hedef dilin hiçbirinde yok.
  assert.equal(isTurkishSentence("Şimdi bunu deneyelim", "latin"), true);
  assert.equal(isTurkishSentence("Bonjour, comment allez-vous", "latin"), false);
});

test("Türkçe işlev sözcükleri Türkçe cümleyi ele verir", () => {
  assert.equal(isTurkishSentence("Bu kelime demek", "latin"), true);
});

test("hedef dil cümlesi ÇAKIŞAN sözcükler yüzünden Türkçe sayılmaz", () => {
  // Liste bilerek "de", "en", "son", "o", "ne" gibi çakışanları dışarıda
  // tutuyor; tutmasaydı hedef dilde geçen ders "Türkçe" diye işaretlenir ve
  // ölçüm tam ters yöne bozulurdu.
  assert.equal(isTurkishSentence("Je viens de la maison en ville", "latin"), false);
  assert.equal(isTurkishSentence("Su hijo o su hermano", "latin"), false);
  assert.equal(isTurkishSentence("Questo e il mio libro", "latin"), false);
});

test("karışık metinde yalnız hedef dil cümleleri ayıklanır", () => {
  const text = "Şunu tekrar edelim. البيت كبير. Şimdi sen söyle.";
  assert.equal(targetPortion(text, "arabic").trim(), "البيت كبير");
});

// --- sayılar ----------------------------------------------------------------

test("söz payı kelime sayısından hesaplanır", () => {
  const q = analyzeLesson(
    [hoca("bir iki üç dört"), ogrenci("beş altı")],
    "latin"
  );
  assert.equal(q.teacherWords, 4);
  assert.equal(q.studentWords, 2);
  assert.equal(q.studentShare, 2 / 6);
});

test("UYGULAMA BİLDİRİMLERİ öğrencinin sözü sayılmaz", () => {
  // Sayılsaydı öğrenci tek kelime yazmadığı hâlde söz payı varmış gibi
  // görünürdü — ölçümü tam ters yöne bozan bir hata.
  const q = analyzeLesson(
    [
      ogrenci("[Uygulama bildirimi: Öğrenci ders ekranını açtı. Dersi sen başlat.]"),
      hoca("Merhaba, başlayalım"),
    ],
    "latin"
  );
  assert.equal(q.studentTurns, 0);
  assert.equal(q.studentWords, 0);
});

test("hocanın hedef dil oranı ölçülür", () => {
  const q = analyzeLesson([hoca("البيت كبير. Bu cümlede ev büyük demek.")], "arabic");
  assert.ok(q.targetRatio !== null && q.targetRatio > 0.2 && q.targetRatio < 0.5);
});

test("soru oranı hem latin hem Arap soru işaretini tanır", () => {
  const q = analyzeLesson([hoca("Nasılsın?"), hoca("كيف حالك؟"), hoca("Peki.")], "arabic");
  assert.equal(q.questionRate, 2 / 3);
});

test("öğrencinin hedef dilde ürettiği turlar sayılır", () => {
  const q = analyzeLesson(
    [ogrenci("أنا بخير"), ogrenci("bilmiyorum"), ogrenci("البيت")],
    "arabic"
  );
  assert.equal(q.studentTargetRatio, 2 / 3);
});

test("yeni kelime yükü KÜÇÜK DEFTERDE hesaplanmaz", () => {
  // Defteri 5 kelimelik öğrencide her cümle "bilinmeyen" çıkar; bunu kusur
  // diye bildirmek hocayı olmayan bir hatayı düzeltmeye zorlardı.
  const q = analyzeLesson([hoca("البيت كبير")], "arabic", ["بيت"]);
  assert.equal(q.newWordLoad, null);
});

test("defter yeterince doluyken yük hesaplanır", () => {
  const deck = Array.from({ length: 40 }, (_, i) => `كلمة${i}`);
  const q = analyzeLesson([hoca("شجرة غريبة")], "arabic", deck);
  assert.ok(q.newWordLoad !== null && q.newWordLoad > 0.5);
});

// --- hüküm ------------------------------------------------------------------

test("AZ TURLU dersten hüküm çıkarılmaz", () => {
  // İki mesajlık açılışta hocanın söz payı doğal olarak %100'dür; bunu
  // "hoca çok konuşuyor" diye bildirmek yanlış alarmdan başka bir şey değil.
  const q = analyzeLesson([hoca("Merhaba nasılsın?"), ogrenci("iyiyim")], "latin");
  assert.deepEqual(lessonFindings(q, "A1"), []);
});

test("hoca ders anlatıyorsa SORUN bildirilir", () => {
  const q = analyzeLesson(
    [...pad(hoca("uzun uzun anlatıyorum ".repeat(20) + "?")), ogrenci("evet")],
    "latin"
  );
  const f = lessonFindings(q, "A1").find((x) => x.key === "sozPayi");
  assert.equal(f?.level, "sorun");
});

test("söz dengesi iyiyse İYİ denir — ölçüm yalnız kusur aramaz", () => {
  const q = analyzeLesson(
    [...pad(hoca("kısa soru?")), ...pad(ogrenci("epey uzun bir cevap veriyorum burada"))],
    "latin"
  );
  const f = lessonFindings(q, "A1").find((x) => x.key === "sozPayi");
  assert.equal(f?.level, "iyi");
});

test("beklenen hedef dil oranı SEVİYEYLE artar", () => {
  // A1'de hocanın çokça Türkçe kullanması doğrudur; sabit bir eşik ya yeni
  // başlayanı boşuna suçlar ya ileri seviyede hiçbir şey yakalamaz.
  assert.ok(expectedTargetRatio("A1") < expectedTargetRatio("B1"));
  assert.ok(expectedTargetRatio("B1") < expectedTargetRatio("C1"));
  assert.equal(expectedTargetRatio(""), 0.25); // seviyesiz profil
});

test("aynı ders A1'de temiz, B2'de kusurlu sayılır", () => {
  // Hocanın sözünün ~%44'ü hedef dilde: A1 beklentisini (%25) rahat geçer,
  // B2 beklentisini (%70) geçemez.
  const lesson = [
    ...pad(hoca("البيت كبير جدا وجميل. Bu ev çok büyük demek, tekrarlar mısın?")),
    ...pad(ogrenci("البيت كبير")),
  ];
  const q = analyzeLesson(lesson, "arabic");
  assert.ok(!lessonFindings(q, "A1").some((f) => f.key === "hedefDil" && f.level !== "iyi"));
  assert.ok(lessonFindings(q, "B2").some((f) => f.key === "hedefDil" && f.level !== "iyi"));
});

test("öğrenci hedef dilde HİÇ üretmediyse sorun bildirilir", () => {
  // Bu uygulamanın nihai hedefi konuşmak; hedef dilde tek cümle kurulmayan
  // ders amacını ıskalamıştır.
  const q = analyzeLesson(
    [...pad(hoca("كيف حالك؟")), ...pad(ogrenci("bilmiyorum hocam"))],
    "arabic"
  );
  const f = lessonFindings(q, "A1").find((x) => x.key === "ogrenciUretim");
  assert.equal(f?.level, "sorun");
});

test("soru sormayan hoca bildirilir", () => {
  const q = analyzeLesson([...pad(hoca("şunu anlatayım")), ...pad(ogrenci("peki"))], "latin");
  assert.ok(lessonFindings(q, "A1").some((x) => x.key === "soru"));
});

// --- hocaya giden özet ------------------------------------------------------

test("özet YALNIZ düzeltilecek bulguları taşır", () => {
  // "İyi" satırlarını yollamak prompt'u şişirir ve modele düzeltilecek bir
  // şey varmış izlenimi verir.
  const q = analyzeLesson(
    [...pad(hoca("kısa soru?")), ...pad(ogrenci("epey uzun bir cevap veriyorum burada"))],
    "latin"
  );
  const digest = lessonQualityDigest(q, "A1");
  assert.ok(!digest.includes("Söz dengesi iyi"));
});

test("kusurlu derste özet hocaya ne yapacağını söyler", () => {
  const q = analyzeLesson(
    [...pad(hoca("uzun uzun anlatıyorum ".repeat(20))), ogrenci("evet")],
    "latin"
  );
  const digest = lessonQualityDigest(q, "A1");
  assert.match(digest, /ÖNCEKİ DERSİN ÖLÇÜMÜ/);
  assert.match(digest, /yaklaşıktır/); // ölçümün niteliği gizlenmiyor
  assert.match(digest, /Öğrenciye bu ölçümlerden söz etme/);
});

test("kusursuz derste prompta HİÇBİR ŞEY eklenmez", () => {
  // Boş bir başlık bile önbellek ön-ekini ve prompt bütçesini boşuna meşgul eder.
  const q = analyzeLesson(
    [
      ...pad(hoca("البيت كبير؟")),
      ...pad(ogrenci("نعم البيت كبير جدا وجميل")),
    ],
    "arabic"
  );
  assert.equal(lessonQualityDigest(q, "A1"), "");
});

// --- eğilim -----------------------------------------------------------------

test("ortalama tek dersi değil EĞİLİMİ gösterir", () => {
  const mk = (share: number): LessonQuality => ({
    teacherTurns: 10,
    studentTurns: 10,
    teacherWords: 100,
    studentWords: 100,
    studentShare: share,
    targetRatio: 0.5,
    questionRate: 0.5,
    studentTargetRatio: 0.5,
    newWordLoad: null,
    at: "2026-09-12T00:00:00.000Z",
  });
  const avg = averageQuality([mk(0.2), mk(0.4)]);
  assert.ok(Math.abs(avg!.studentShare! - 0.3) < 1e-9);
  assert.equal(avg?.newWordLoad, null); // hiç ölçülmemiş alan uydurulmaz
});

test("hüküm verilemeyecek kadar kısa dersler ortalamaya girmez", () => {
  const short: LessonQuality = {
    teacherTurns: 1,
    studentTurns: 0,
    teacherWords: 5,
    studentWords: 0,
    studentShare: 0,
    targetRatio: 0,
    questionRate: 0,
    studentTargetRatio: null,
    newWordLoad: null,
    at: "2026-09-12T00:00:00.000Z",
  };
  assert.equal(averageQuality([short]), null);
});

test("kayıt listesi budanır", () => {
  const list = Array.from({ length: KEEP_QUALITY + 5 }, (_, i) => ({
    teacherTurns: i,
  })) as LessonQuality[];
  const pruned = pruneQuality(list);
  assert.equal(pruned.length, KEEP_QUALITY);
  assert.equal(pruned.at(-1)!.teacherTurns, KEEP_QUALITY + 4); // en yenisi durur
});
