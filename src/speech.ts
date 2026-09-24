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

/**
 * AKIŞLI KONUŞMA KUYRUĞU — Konuşma Odası'nın ses motoru.
 *
 * speakSequence hazır bir listeyi okur; burada liste akış hâlinde büyür:
 * model cevabı damla damla gelirken tamamlanan her cümle push() ile eklenir
 * ve kuyruk boşsa hemen okunmaya başlar. Böylece ilk ses, cevabın sonunu
 * değil ilk cümleyi bekler — konuşma hissinin yarısı bu gecikmede.
 *
 * finish(): "başka cümle gelmeyecek" işareti. Kuyruk boşalınca onIdle
 * çağrılır — ekran o anda mikrofonu açar (sıra öğrencide).
 * cancel(): her şeyi keser; onIdle ÇAĞRILMAZ (kesilen konuşmanın ardından
 * mikrofon açılırsa öğrenci yarım kalan bir sıraya cevap vermek zorunda kalır).
 */
export interface SpeechQueue {
  push: (sentence: string) => void;
  finish: () => void;
  cancel: () => void;
  /** Şu an konuşuyor mu (kuyrukta ya da ağızda cümle var). */
  readonly speaking: boolean;
}

export function createSpeechQueue(opts: {
  rate?: number;
  onSentence?: (text: string) => void;
  onIdle?: () => void;
} = {}): SpeechQueue {
  const pack = getActivePack();
  const queue: string[] = [];
  let busy = false;
  let finished = false;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const next = () => {
    if (cancelled) return;
    if (queue.length === 0) {
      busy = false;
      if (finished) opts.onIdle?.();
      return;
    }
    busy = true;
    const text = queue.shift()!;
    const toSpeak = extractScript(text, pack.script) || text;
    if (!toSpeak.trim()) {
      next();
      return;
    }
    opts.onSentence?.(text);
    let advanced = false;
    const done = () => {
      if (advanced || cancelled) return;
      advanced = true;
      clear();
      next();
    };
    // Bekçi: bazı Android TTS motorları onDone/onError'ı hiç çağırmaz.
    timer = setTimeout(done, 6000 + toSpeak.length * 180);
    Speech.speak(toSpeak, {
      language: pack.ttsLocale,
      rate: opts.rate ?? 0.95,
      onDone: done,
      onError: done,
    });
  };

  return {
    push: (sentence) => {
      if (cancelled || !sentence.trim()) return;
      queue.push(sentence);
      if (!busy) next();
    },
    finish: () => {
      finished = true;
      // Hiç cümle gelmediyse (boş cevap) ya da kuyruk zaten bittiyse
      // onIdle'ı buradan tetikle; yoksa sıra öğrenciye hiç geçmez.
      if (!busy && queue.length === 0 && !cancelled) opts.onIdle?.();
    },
    cancel: () => {
      cancelled = true;
      queue.length = 0;
      busy = false;
      clear();
      Speech.stop();
    },
    get speaking() {
      return busy || queue.length > 0;
    },
  };
}
