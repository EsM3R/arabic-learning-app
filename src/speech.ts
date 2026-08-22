import * as Speech from "expo-speech";
import { getActivePack } from "./languages";

/** Bir metindeki Arapça bölümleri ayıklar (harf aralıkları + Arapça noktalama). */
export function extractArabic(text: string): string {
  const matches = text.match(
    /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿](?:[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿\s،؛؟ـ]*[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿؟])?/g
  );
  if (!matches) return "";
  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("، ");
}

/**
 * Hedef dildeki metni sesli okur. Ayrı alfabeli dillerde (Arapça) metinden
 * önce hedef dil bölümleri ayıklanır; Latin alfabeli dillerde metin olduğu
 * gibi okunur. slow=true → yavaş telaffuz (dinleyip tekrar etmek için).
 */
export function speakTarget(text: string, slow = false): void {
  const pack = getActivePack();
  const toSpeak = pack.scriptExtract ? extractArabic(text) || text : text;
  if (!toSpeak.trim()) return;
  Speech.stop();
  Speech.speak(toSpeak, {
    language: pack.ttsLocale,
    rate: slow ? 0.55 : 0.95,
  });
}

/** Geriye dönük ad — mevcut ekranlar bu adla çağırıyor. */
export const speakArabic = speakTarget;

export function stopSpeaking(): void {
  Speech.stop();
}
