/**
 * Sesle giriş — SAF mantık (React/RN importu YOK; tests/speechinput.test.ts).
 *
 * Uygulamanın en büyük eksiği şuydu: öğrenciyi HİÇ duymuyordu. Kayıt alınıp
 * geri çalınıyor, hakem öğrencinin kendi kulağı oluyordu — hatasını zaten
 * duyamadığı için en zayıf hakem. Cihazın kendi ses tanıması bunu bedavaya
 * çözer: söylediği yazıya döner, hem cihaz anında karşılaştırır hem de
 * hocaya METİN olarak ulaşıp değerlendirilir.
 *
 * Buradaki mantık saf tutulur; modülün kendisi (mikrofon, izinler, olaylar)
 * ekran tarafında.
 */
import { matchProduction, normalizeTarget, normalizeTranslit } from "./textnorm.ts";
import type { ProductionMatch } from "./textnorm.ts";

/** Ses tanımanın hedef dili — BCP-47. Latin dillerde ülke kodu da gerekir. */
export const SPEECH_LOCALES: Record<string, string> = {
  ar: "ar-SA", // Android'in Arapça tanıması fusha/Körfez ağırlıklı; ammicede şaşabilir
  en: "en-US",
  es: "es-ES",
};

export function speechLocale(languageId: string): string {
  return SPEECH_LOCALES[languageId] ?? "en-US";
}

/**
 * Sesli mesaj işareti. Hoca, öğrencinin YAZDIĞI ile SÖYLEDİĞİNİ ayırt
 * edebilmeli: ses tanıma gürültülüdür, kelime kelime yazım düzeltmesi
 * yapılmamalı ama telaffuzdan doğan belirgin hatalar işlenmelidir.
 */
export const SPOKEN_PREFIX = "[sesli]";

export function markSpoken(text: string): string {
  return `${SPOKEN_PREFIX} ${text.trim()}`;
}

export function isSpoken(text: string): boolean {
  return text.trimStart().startsWith(SPOKEN_PREFIX);
}

/** İşareti söker — ekranda öğrenciye kendi cümlesi temiz görünsün. */
export function stripSpokenMark(text: string): string {
  const t = text.trimStart();
  return t.startsWith(SPOKEN_PREFIX) ? t.slice(SPOKEN_PREFIX.length).trim() : text;
}

export type SpeechVerdict = "dogru" | "yakin" | "uzak" | "bos";

export interface SpeechAttempt {
  verdict: SpeechVerdict;
  /** 0-1: hedefle örtüşme oranı (karakter düzeyinde). */
  similarity: number;
  /** Eşleşme hedef yazımdan mı okunuştan mı geldi. */
  match: ProductionMatch;
  /** Ekranda gösterilecek Türkçe kısa değerlendirme. */
  message: string;
}

/** Levenshtein — kısa dizeler için yeterli (hedefler tek kelime/kısa cümle). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0-1 benzerlik (1 = birebir). */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

/** "yakın" sayılma eşiği — altındaki denemeler telaffuz hatası sayılır. */
export const NEAR_THRESHOLD = 0.7;

/**
 * Bir sesli denemeyi hedefle karşılaştırır. Önce mevcut üretim
 * eşleştiricisi (hedef yazım / okunuş toleransı) denenir; tutmazsa
 * benzerlikle "yakın mı, uzak mı" ayrımı yapılır.
 *
 * NOT: bu bir telaffuz PUANI değildir — ses tanımanın duyduğu şeydir.
 * Makine ع'ını duyamadıysa bu da bir bilgidir, ama Şam ammicesinde tanıma
 * zayıf olabileceği için "uzak" sonucu tek başına suç delili sayılmamalı;
 * ekran bunu öğrenciye böyle söyler.
 */
export function judgeSpeech(
  target: string,
  translit: string,
  heard: string,
  arabicScript: boolean
): SpeechAttempt {
  const said = (heard ?? "").trim();
  if (!said) {
    return {
      verdict: "bos",
      similarity: 0,
      match: "none",
      message: "Ses alınamadı — bir daha dene.",
    };
  }
  const match = matchProduction(target, translit, said, arabicScript);
  if (match !== "none") {
    return {
      verdict: "dogru",
      similarity: 1,
      match,
      message: match === "translit" ? "Doğru (okunuşundan tanındı) ✓" : "Doğru ✓",
    };
  }
  // Hem hedef yazımla hem okunuşla karşılaştır; iyi olanı al.
  const normTarget = normalizeTarget(target, arabicScript);
  const normSaid = normalizeTarget(said, arabicScript);
  const scoreTarget = similarity(normTarget, normSaid);
  const scoreTranslit = arabicScript
    ? similarity(normalizeTranslit(translit), normalizeTranslit(said))
    : 0;
  const score = Math.max(scoreTarget, scoreTranslit);
  if (score >= NEAR_THRESHOLD) {
    return {
      verdict: "yakin",
      similarity: score,
      match: "none",
      message: `Yakın — duyulan: "${said}". Bir daha, sesleri daha net ayır.`,
    };
  }
  return {
    verdict: "uzak",
    similarity: score,
    match: "none",
    message: `Duyulan: "${said}". Hedeften uzak — önce dinle, sonra tekrar söyle.`,
  };
}
