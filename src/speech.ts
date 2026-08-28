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

export interface SequenceHandle {
  cancel: () => void;
}

/**
 * Cümleleri sırayla okur. Android'de kelime-seviyesi onBoundary güvenilmez —
 * senkron CÜMLE seviyesinde, onDone zinciriyle kurulur. onError da zinciri
 * sürdürür; bazı Android TTS motorları onDone/onError'ı HİÇ çağırmadığı için
 * her cümleye bekçi zamanlayıcı konur (metin uzunluğuna göre ölçekli).
 */
export function speakSequence(
  texts: string[],
  opts: {
    startIndex?: number;
    slow?: boolean;
    onSentence?: (index: number) => void;
    onDone?: () => void;
  } = {}
): SequenceHandle {
  const pack = getActivePack();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const speakAt = (i: number) => {
    if (cancelled) return;
    if (i >= texts.length) {
      opts.onDone?.();
      return;
    }
    opts.onSentence?.(i);
    let advanced = false;
    const next = () => {
      if (advanced || cancelled) return;
      advanced = true;
      clear();
      speakAt(i + 1);
    };
    timer = setTimeout(next, 8000 + texts[i].length * 200); // bekçi
    Speech.speak(texts[i], {
      language: pack.ttsLocale,
      rate: opts.slow ? 0.55 : 0.9,
      onDone: next,
      onError: next,
    });
  };

  Speech.stop();
  speakAt(opts.startIndex ?? 0);
  return {
    cancel: () => {
      cancelled = true;
      clear();
      Speech.stop();
    },
  };
}
