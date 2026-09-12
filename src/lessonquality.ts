/**
 * DERSİN KENDİSİNİ ölçmek.
 *
 * Uygulamadaki bütün ölçüm öğrenciye bakıyordu: kaç kelime tekrar etti, kaç
 * cümle konuştu, kaç metin bitirdi. Hocaya hiç bakılmıyordu. Oysa uygulamanın
 * tamamı "model iyi ders anlatıyor" varsayımına dayanıyor ve o varsayımın
 * hiçbir ölçüsü yoktu. Kötü ders ile iyi ders arasındaki fark, ekranda
 * birbirinin aynı görünür: ikisinde de balonlar dolar, araçlar çalışır,
 * sayaçlar artar.
 *
 * Burada ölçülenler dil öğretiminin klasik ve TARTIŞMASIZ göstergeleri:
 *
 * - ÖĞRENCİNİN SÖZ PAYI. Öğretmen konuşma süresi (TTT) uzadıkça öğrencinin
 *   üretim fırsatı kısalır. Ders bir anlatıma dönüşmüşse öğrenci dinleyicidir,
 *   konuşmayı dinleyerek öğrenen yoktur.
 * - HOCANIN HEDEF DİL ORANI. Seviye yükseldikçe hedef dilin payı artmalı;
 *   B2'de hâlâ Türkçe anlatan bir hoca, öğrenciyi hedef dile hiç maruz
 *   bırakmıyor demektir.
 * - SORU SORMA. Soru sormayan hoca üretim istemiyor; ders karşılıklı
 *   konuşma değil sunum olur.
 * - ÖĞRENCİNİN HEDEF DİLDE ÜRETİMİ. Bu uygulamanın nihai hedefi konuşmak;
 *   öğrenci ders boyunca yalnız Türkçe yazdıysa dersin amacı ıskalanmış
 *   demektir.
 * - YENİ KELİME YÜKÜ. Hocanın hedef dil cümlelerinin öğrencinin defterine
 *   göre bilinmeyen oranı. Çok yüksekse ders öğrencinin üstünde.
 *
 * DÜRÜSTLÜK NOTU — ölçüm YAKLAŞIKTIR ve sınırı şurada:
 * Latin yazılı hedef dillerde (İngilizce, Fransızca, Almanca, İspanyolca,
 * İtalyanca) Türkçe ile hedef dili yazıdan ayırmak kesin değil; Türkçeye
 * özgü harfler (ğ, ı, ş) ve Türkçeye özgü işlev sözcükleri üzerinden tahmin
 * yürütülür. Arapça/Farsça/Rusçada ayrım yazının kendisinden geldiği için
 * kesindir. Bu yüzden çıkan sayılar "yaklaşık" diye sunulur; kullanıcıya da
 * hocaya da kesin ölçüm gibi gösterilmez.
 */
// Uzantılı import ve ayrı `import type` satırları: bu modül saf node test
// koşucusunda da yükleniyor (bkz. tests/lessonquality.test.ts).
import { containsTargetScript } from "./scripts.ts";
import type { ScriptId } from "./scripts.ts";
import { coverage } from "./textnorm.ts";
import type { ChatMessage } from "./types.ts";

/**
 * Türkçeye ÖZGÜ harfler: ğ ve ı (noktasız i), uygulamadaki sekiz hedef dilin
 * hiçbirinde yok. ş de öyle. Bir cümlede bunlardan biri varsa cümle Türkçedir.
 */
const TURKISH_LETTERS = /[ğışĞİŞ]/;

/**
 * Türkçe işlev sözcükleri — hedef dillerle ÇAKIŞMAYANLAR.
 *
 * Liste bilerek kısa: "de", "da", "o", "ne", "en", "son", "mi", "her" gibi
 * yüksek frekanslı Türkçe sözcükler Fransızca/İspanyolca/İtalyanca/
 * İngilizcede de var. Çakışan bir sözcük eklemek, hedef dilde geçen dersi
 * "Türkçe konuşmuş" diye işaretler ve ölçümü ters yöne bozar — eksik ölçmek
 * yanlış ölçmekten iyidir.
 */
const TURKISH_MARKERS = new Set([
  "ve",
  "bir",
  "bu",
  "bunu",
  "şu",
  "için",
  "çok",
  "değil",
  "gibi",
  "kadar",
  "daha",
  "sonra",
  "şimdi",
  "yani",
  "ile",
  "olarak",
  "var",
  "yok",
  "evet",
  "tamam",
  "nasıl",
  "neden",
  "hangi",
  "şey",
  "çünkü",
  "böyle",
  "şöyle",
  "ayrıca",
  "yine",
  "bence",
  "senin",
  "benim",
  "onun",
  "bizim",
  "beni",
  "seni",
  "bana",
  "sana",
  "demek",
  "anlamına",
  "kullanılır",
  "kelime",
  "cümle",
  "örnek",
  "biraz",
  "birlikte",
  "hadi",
  "haydi",
  "tekrar",
  "doğru",
  "yanlış",
  "güzel",
  "anladın",
  "anladım",
]);

/** Cümlelere böler; hem latin hem Arap/Fars soru işaretini tanır. */
function sentences(text: string): string[] {
  return text
    .split(/[.!?؟…\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length > 0);
}

const wordCount = (text: string): number => words(text).length;

/**
 * Bir cümle Türkçe mi (yani hedef dilde DEĞİL mi)?
 *
 * Latin dışı yazılarda karar yazının kendisinden gelir ve kesindir. Latin
 * yazıda tahmindir: Türkçeye özgü harf ya da yeterli sayıda Türkçe işlev
 * sözcüğü aranır.
 */
export function isTurkishSentence(sentence: string, script: ScriptId): boolean {
  if (script !== "latin") return !containsTargetScript(sentence, script);
  if (TURKISH_LETTERS.test(sentence)) return true;
  const toks = words(sentence).map((w) =>
    w.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "")
  );
  if (toks.length === 0) return false;
  const hits = toks.filter((t) => TURKISH_MARKERS.has(t)).length;
  // Tek işaret bile kısa cümlede belirleyicidir; uzun cümlede oran aranır.
  return hits >= 2 || hits / toks.length >= 0.2;
}

/** Metnin hedef dildeki kısmı (Türkçe cümleler atılır). */
export function targetPortion(text: string, script: ScriptId): string {
  return sentences(text)
    .filter((s) => !isTurkishSentence(s, script))
    .join(" ");
}

export interface LessonQuality {
  /** Değerlendirmeye giren hoca turu sayısı. */
  teacherTurns: number;
  studentTurns: number;
  teacherWords: number;
  studentWords: number;
  /** Öğrencinin söz payı (0..1). Tur yoksa null. */
  studentShare: number | null;
  /** Hocanın hedef dil oranı (0..1). */
  targetRatio: number | null;
  /** Soru içeren hoca turlarının oranı (0..1). */
  questionRate: number | null;
  /** Öğrencinin hedef dilde yazdığı tur oranı (0..1). */
  studentTargetRatio: number | null;
  /** Hocanın hedef dil metninde defterine göre bilinmeyen oran. Defter küçükse null. */
  newWordLoad: number | null;
  at: string;
  /**
   * Hangi sohbete ait. Ders başına TEK kayıt tutulabilsin diye: her turda
   * yeni satır eklense on beş turluk bir ders, on beş kısa dersmiş gibi
   * ortalamaya girer ve eğilim anlamını yitirirdi.
   */
  chatId?: string;
}

/** Bu sayıdan az hoca turu varsa ders hakkında hüküm verilmez. */
export const MIN_TURNS_FOR_VERDICT = 4;
/** Yeni kelime yükü ancak defter bu kadar dolduğunda anlamlı olur. */
export const MIN_DECK_FOR_LOAD = 30;

/**
 * Uygulama bildirimleri (kickoff, sessizlik dürtmesi, uyanış olayı) öğrencinin
 * yazdığı mesaj DEĞİLDİR. Sayılsalardı öğrenci hiç yazmadığı hâlde söz payı
 * varmış gibi görünürdü — ölçümü tam ters yöne bozan bir hata.
 */
function isAppEvent(content: string): boolean {
  return content.trimStart().startsWith("[Uygulama bildirimi:");
}

export function analyzeLesson(
  messages: ChatMessage[],
  script: ScriptId,
  knownWords: string[] = [],
  now = new Date()
): LessonQuality {
  const teacher = messages.filter((m) => m.role === "assistant");
  const student = messages.filter((m) => m.role === "user" && !isAppEvent(m.content));

  const teacherWords = teacher.reduce((n, m) => n + wordCount(m.content), 0);
  const studentWords = student.reduce((n, m) => n + wordCount(m.content), 0);
  const total = teacherWords + studentWords;

  const teacherTargetWords = teacher.reduce(
    (n, m) => n + wordCount(targetPortion(m.content, script)),
    0
  );
  const questions = teacher.filter((m) => /[?؟]/.test(m.content)).length;
  const studentInTarget = student.filter(
    (m) => targetPortion(m.content, script).trim().length > 0
  ).length;

  const teacherTargetText = teacher
    .map((m) => targetPortion(m.content, script))
    .join(" ")
    .trim();
  const load =
    knownWords.length >= MIN_DECK_FOR_LOAD && teacherTargetText.length > 0
      ? 1 - coverage(teacherTargetText, knownWords, script).ratio
      : null;

  return {
    teacherTurns: teacher.length,
    studentTurns: student.length,
    teacherWords,
    studentWords,
    studentShare: total > 0 ? studentWords / total : null,
    targetRatio: teacherWords > 0 ? teacherTargetWords / teacherWords : null,
    questionRate: teacher.length > 0 ? questions / teacher.length : null,
    studentTargetRatio: student.length > 0 ? studentInTarget / student.length : null,
    newWordLoad: load,
    at: now.toISOString(),
  };
}

/**
 * Seviyeye göre beklenen asgari hedef dil oranı.
 *
 * A1'de hocanın çokça Türkçe kullanması DOĞRUDUR — anlaşılmayan girdi girdi
 * değildir. Beklenti seviye yükseldikçe artar; sabit bir eşik ya yeni
 * başlayanı boşuna suçlar ya ileri seviyede hiçbir şey yakalamaz.
 */
export function expectedTargetRatio(level: string): number {
  const l = (level || "A0").toUpperCase().slice(0, 2);
  if (l === "A0" || l === "A1") return 0.25;
  if (l === "A2") return 0.4;
  if (l === "B1") return 0.55;
  if (l === "B2") return 0.7;
  return 0.85; // C1, C2
}

export type FindingLevel = "iyi" | "dikkat" | "sorun";

export interface QualityFinding {
  key: string;
  level: FindingLevel;
  text: string;
}

/** Oranı yüzde metnine çevirir. */
const pct = (v: number) => `%${Math.round(v * 100)}`;

/**
 * Ölçümleri okunur bulgulara çevirir.
 *
 * Az turlu bir dersten hüküm çıkarılmaz: iki mesajlık bir açılışta hocanın
 * söz payı doğal olarak %100'dür ve bunu "hoca çok konuşuyor" diye bildirmek
 * yanlış alarmdan başka bir şey olmaz.
 */
export function lessonFindings(q: LessonQuality, level: string): QualityFinding[] {
  if (q.teacherTurns < MIN_TURNS_FOR_VERDICT) return [];
  const out: QualityFinding[] = [];

  if (q.studentShare !== null) {
    if (q.studentShare < 0.15) {
      out.push({
        key: "sozPayi",
        level: "sorun",
        text: `Ders anlatıma dönüşmüş: sözün yalnız ${pct(q.studentShare)}'i öğrencinin. Konuşmayı dinleyerek öğrenen yok.`,
      });
    } else if (q.studentShare < 0.3) {
      out.push({
        key: "sozPayi",
        level: "dikkat",
        text: `Öğrencinin söz payı ${pct(q.studentShare)} — hoca fazla konuşuyor, üretim fırsatı dar.`,
      });
    } else {
      out.push({
        key: "sozPayi",
        level: "iyi",
        text: `Söz dengesi iyi: öğrenci ${pct(q.studentShare)} pay almış.`,
      });
    }
  }

  if (q.targetRatio !== null) {
    const want = expectedTargetRatio(level);
    if (q.targetRatio < want * 0.6) {
      out.push({
        key: "hedefDil",
        level: "sorun",
        text: `Hoca neredeyse hep Türkçe konuşmuş (hedef dil ${pct(q.targetRatio)}); ${level} için beklenen en az ${pct(want)}.`,
      });
    } else if (q.targetRatio < want) {
      out.push({
        key: "hedefDil",
        level: "dikkat",
        text: `Hedef dil oranı ${pct(q.targetRatio)} — ${level} seviyesi için ${pct(want)} beklenir.`,
      });
    } else {
      out.push({
        key: "hedefDil",
        level: "iyi",
        text: `Hedef dil kullanımı seviyene uygun (${pct(q.targetRatio)}).`,
      });
    }
  }

  if (q.questionRate !== null && q.questionRate < 0.35) {
    out.push({
      key: "soru",
      level: "dikkat",
      text: `Hoca turlarının yalnız ${pct(q.questionRate)}'inde soru sormuş; ders karşılıklı konuşma değil sunum olmuş.`,
    });
  }

  if (q.studentTargetRatio !== null && q.studentTurns >= MIN_TURNS_FOR_VERDICT) {
    if (q.studentTargetRatio === 0) {
      out.push({
        key: "ogrenciUretim",
        level: "sorun",
        text: "Öğrenci ders boyunca hedef dilde tek cümle kurmamış — dersin asıl amacı ıskalanmış.",
      });
    } else if (q.studentTargetRatio < 0.3) {
      out.push({
        key: "ogrenciUretim",
        level: "dikkat",
        text: `Öğrenci turlarının ${pct(q.studentTargetRatio)}'inde hedef dil kullanmış; daha çok üretim istenmeli.`,
      });
    }
  }

  if (q.newWordLoad !== null && q.newWordLoad > 0.35) {
    out.push({
      key: "yuk",
      level: "dikkat",
      text: `Hocanın cümlelerinin ${pct(q.newWordLoad)}'i defterin dışında — ders biraz üstünde kalmış olabilir.`,
    });
  }

  return out;
}

/**
 * Hocanın KENDİ promptuna giren özet.
 *
 * Uygulamanın her yerinde işleyen kalıp bu: ölçülen şey hocaya söylenmezse
 * ölçmenin bir anlamı yok. Öğrencinin durumu zaten besleniyordu; hocanın
 * kendi davranışı beslenmiyordu — yani hoca kendi dersinin nasıl gittiğini
 * göremiyordu.
 *
 * Yalnız DÜZELTİLECEK bulgular gönderilir: "iyi" satırlarını yollamak
 * prompt'u şişirir ve modele düzeltilecek bir şey varmış izlenimi verir.
 */
export function lessonQualityDigest(q: LessonQuality | null, level: string): string {
  if (!q) return "";
  const issues = lessonFindings(q, level).filter((f) => f.level !== "iyi");
  if (issues.length === 0) return "";
  const lines = issues.map((f) => `- ${f.text}`);
  return (
    "\n\nÖNCEKİ DERSİN ÖLÇÜMÜ (uygulama tarafından cihazda hesaplandı, yaklaşıktır):\n" +
    `${lines.join("\n")}\n` +
    "Bunlar senin öğretme biçiminle ilgili; bu derste düzelt. Öğrenciye bu ölçümlerden söz etme."
  );
}

/** Kayıtlı ölçümlerin ortalaması — tek ders değil EĞİLİM gösterir. */
export function averageQuality(list: LessonQuality[]): LessonQuality | null {
  const usable = list.filter((q) => q.teacherTurns >= MIN_TURNS_FOR_VERDICT);
  if (usable.length === 0) return null;
  const mean = (pick: (q: LessonQuality) => number | null): number | null => {
    const vals = usable.map(pick).filter((v): v is number => v !== null);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const sum = (pick: (q: LessonQuality) => number) =>
    usable.reduce((n, q) => n + pick(q), 0);
  return {
    teacherTurns: sum((q) => q.teacherTurns),
    studentTurns: sum((q) => q.studentTurns),
    teacherWords: sum((q) => q.teacherWords),
    studentWords: sum((q) => q.studentWords),
    studentShare: mean((q) => q.studentShare),
    targetRatio: mean((q) => q.targetRatio),
    questionRate: mean((q) => q.questionRate),
    studentTargetRatio: mean((q) => q.studentTargetRatio),
    newWordLoad: mean((q) => q.newWordLoad),
    at: usable[usable.length - 1].at,
  };
}

/** Kayıt listesini budar — eğilim için son birkaç ders yeter. */
export const KEEP_QUALITY = 12;

export function pruneQuality(list: LessonQuality[]): LessonQuality[] {
  return list.slice(-KEEP_QUALITY);
}
