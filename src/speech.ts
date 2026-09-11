import * as Speech from "expo-speech";
import { getActivePack } from "./languages";
import { extractScript } from "./scripts";

/**
 * Geriye dönük ad — hedef alfabe bölümlerini ayıklar. Ayıklama mantığı artık
 * yazı sistemine göre src/scripts.ts'te; burası aktif paketin alfabesini
 * kullanan ince bir sarmalayıcı.
 */
export function extractArabic(text: string): string {
  return extractScript(text, getActivePack().script);
}

/**
 * Hedef dildeki metni sesli okur. Ayrı alfabeli dillerde (Arapça) metinden
 * önce hedef dil bölümleri ayıklanır; Latin alfabeli dillerde metin olduğu
 * gibi okunur. slow=true → yavaş telaffuz (dinleyip tekrar etmek için).
 */
export function speakTarget(text: string, slow = false): void {
  const pack = getActivePack();
  const toSpeak = extractScript(text, pack.script) || text;
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

const voiceCache = new Map<string, string[]>(); // languageId → voice identifier listesi

/**
 * Aktif dilin TTS locale'ine uyan cihaz seslerinin kimlikleri (HVPT ses
 * çeşitliliği için). Eşleşme dil ön ekiyle yapılır ("ar" → "ar-SA", "ar_EG";
 * en-GB dersinde en-US sesi hata değil, istenen çeşitliliktir). Hata olursa
 * boş liste döner — arayan hız varyasyonuna düşer.
 */
export async function getTargetVoiceIds(): Promise<string[]> {
  const pack = getActivePack();
  const cached = voiceCache.get(pack.id);
  if (cached) return cached;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const prefix = pack.ttsLocale.split("-")[0].toLowerCase();
    const ids = voices
      .filter((v) => (v.language ?? "").toLowerCase().replace("_", "-").split("-")[0] === prefix)
      .map((v) => v.identifier);
    voiceCache.set(pack.id, ids);
    return ids;
  } catch {
    return [];
  }
}

/** speakTarget'in ses/hız/geri çağrı seçenekli hali (HVPT ve shadowing kullanır). */
export function speakTargetWith(
  text: string,
  opts: { voiceId?: string; rate?: number; onDone?: () => void; onError?: () => void } = {}
): void {
  const pack = getActivePack();
  const toSpeak = extractScript(text, pack.script) || text;
  if (!toSpeak.trim()) {
    opts.onDone?.();
    return;
  }
  Speech.stop();
  Speech.speak(toSpeak, {
    language: pack.ttsLocale,
    voice: opts.voiceId,
    rate: opts.rate ?? 0.95,
    onDone: opts.onDone,
    onError: opts.onError ?? opts.onDone, // hata da zinciri kilitlemesin
  });
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
