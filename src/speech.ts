import * as Speech from "expo-speech";

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

/** Arapça metni sesli okur. slow=true → yavaş telaffuz (dinleyip tekrar etmek için). */
export function speakArabic(text: string, slow = false): void {
  const arabic = extractArabic(text) || text;
  if (!arabic.trim()) return;
  Speech.stop();
  Speech.speak(arabic, {
    language: "ar",
    rate: slow ? 0.55 : 0.95,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}
