/**
 * Yazı sistemi katmanı — SAF modül (React/RN importu YOK; tests/scripts.test.ts).
 *
 * Motor uzun süre tek bir boole ile çalıştı: `scriptExtract` ("hedef dil Arap
 * alfabesinde mi"). Arapça dışında Latin olmayan bir dil eklenince o boole
 * yalan söylemeye başlıyor:
 *   - Kiril soldan sağa yazılır (RTL değil) ama çeviriyazı İSTER.
 *   - Farsça Arap alfabesiyle yazılır ama harfleri (ی ک) ve klitikleri
 *     (می، ها، تر) Arapçanınkinden farklıdır.
 * Tek boole bu üç soruyu birbirine yapıştırmıştı: "sağdan sola mı?",
 * "okunuş gerekli mi?", "hangi normalizasyon?". Burada yazı sistemi KİMLİĞİ
 * taşınıyor ve üç soru ayrı ayrı cevaplanıyor.
 */

/**
 * Yazı sistemi kimliği. "persian" ayrı bir kimliktir çünkü Arap alfabesini
 * kullansa da harf varyantları ve ek yapısı farklıdır — aynı kovaya konulsaydı
 * Farsça kelimeler yanlış normalize edilir, kapsam ölçümü sessizce bozulurdu.
 */
export type ScriptId = "latin" | "arabic" | "persian" | "cyrillic";

/** Sağdan sola yazılır mı (RTL hizalama + Naskh yazı tipi). */
export function isRtl(script: ScriptId): boolean {
  return script === "arabic" || script === "persian";
}

/** Arap alfabesi ailesi mi (hareke/harf aralığı ortak). */
export function isArabicFamily(script: ScriptId): boolean {
  return script === "arabic" || script === "persian";
}

/**
 * Latin dışı her yazı sistemi çeviriyazı ister: öğrencinin o klavyesi
 * olmayabilir ve kart üstünde okunuşu görmesi gerekir.
 */
export function needsTranslit(script: ScriptId): boolean {
  return script !== "latin";
}

/** Prompt'ta kelime listelerinin ayracı (Arap alfabesinde Arapça virgül). */
export function listSeparator(script: ScriptId): string {
  return isArabicFamily(script) ? "، " : ", ";
}

/**
 * Hedef alfabe aralıkları. Latin için aralık YOK: Türkçe de Latin
 * alfabesiyle yazıldığı için "hedef dilde mi yazılmış" sorusu Latin
 * dillerde güvenle cevaplanamaz (bkz. LessonScreen üretim ölçümü).
 */
/** Harf aralığı (karakter sınıfı içeriği, köşeli parantezsiz). */
const LETTERS: Record<ScriptId, string> = {
  latin: "",
  // Arap bloğu + ek bloklar (U+0600–U+06FF, U+0750–U+077F, sunum biçimleri)
  arabic: "\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF",
  persian: "\\u0600-\\u06FF\\u0750-\\u077F\\uFB50-\\uFDFF\\uFE70-\\uFEFF",
  // Kiril bloğu + eki
  cyrillic: "\\u0400-\\u04FF\\u0500-\\u052F",
};

/**
 * Ayıklamada aynı parçanın içinde sayılan bağlayıcılar: boşluk ve o yazı
 * sisteminin kendi noktalaması. Böylece "مرحبا يا صديقي" tek parça çıkar,
 * kelime kelime doğranıp seslendirme kesik kesik olmaz.
 */
function joiners(script: ScriptId): string {
  return isArabicFamily(script) ? "\\s،؛ـ\\u200C" : "\\s,;:!?«»\\-";
}

/**
 * Bir metindeki hedef alfabe bölümlerini ayıklar (seslendirme için).
 * Latin dillerde boş string döner — orada ayıklamaya gerek yoktur, metin
 * olduğu gibi okunur.
 */
export function extractScript(text: string, script: ScriptId): string {
  const letters = LETTERS[script];
  if (!letters) return "";
  const re = new RegExp(`[${letters}](?:[${letters}${joiners(script)}]*[${letters}])?`, "g");
  const matches = text.match(re);
  if (!matches) return "";
  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(listSeparator(script));
}

/**
 * Metinde hedef alfabeden parça var mı. Latin dillerde HER ZAMAN false:
 * öğrencinin Türkçe mi hedef dilde mi yazdığı ayırt edilemez, dürüst
 * ölçüm için "bilmiyorum" demek "evet" demekten iyidir.
 */
export function containsTargetScript(text: string, script: ScriptId): boolean {
  const letters = LETTERS[script];
  return letters.length > 0 && new RegExp(`[${letters}]`).test(text);
}
