/**
 * Mikrofon kancası: cihazın kendi ses tanımasıyla konuşmayı yazıya çevirir.
 * API maliyeti YOKTUR — tanıma telefonda/Google servisinde yapılır.
 *
 * BASILI TUT — BIRAK düzeni: tanıma "sürekli" kipte açılır ve öğrenci
 * düğmeyi bırakana kadar kapanmaz. Sebebi gerçek kullanımdan geldi:
 * varsayılan kipte Android, kısa bir duraksamayı "cümle bitti" sayıp
 * tanımayı sonlandırıyor; yabancı dilde yavaş konuşan biri cümlesini
 * bitiremeden kesiliyordu. Bitişe artık makine değil öğrenci karar verir.
 *
 * Saf mantık src/speechinput.ts'te; burada yalnız izin, başlat/durdur ve
 * olay tesisatı var.
 */
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useEffect, useRef, useState } from "react";
import { getActiveLanguageId } from "./languages";
import { speechLocale } from "./speechinput";

export interface DictationState {
  /** Dinleme sürüyor mu. */
  listening: boolean;
  /** Konuşurken akan ara metin (kesinleşmemiş). */
  partial: string;
  /** Son hata (Türkçe). */
  error: string | null;
  start: () => void;
  stop: () => void;
}

export interface DictationOptions {
  /** Konuşma bittiğinde (öğrenci bıraktığında) toplanan metin. */
  onResult: (text: string) => void;
  /** Hedef dil yerine başka bir dili dinlemek için. */
  lang?: string;
  /**
   * ELLER SERBEST kip (Konuşma Odası): öğrenci bir şey söyledikten sonra bu
   * kadar ms yeni parça gelmezse dinleme kendiliğinden kapanır ve metin
   * teslim edilir. Düğme yok — gerçek konuşmadaki gibi susunca sıra geçer.
   *
   * Basılı-tut kipinden farkı: orada bitişe öğrenci karar verir (yavaş
   * konuşan kesilmesin diye); burada sessizlik karar verir ama süre
   * Android'in kendi eşiğinden (~1 sn) çok daha uzun tutulur.
   * Hiç ses gelmediyse sayaç çalışmaz — boş odada mikrofon kapanıp durmasın.
   */
  autoStopMs?: number;
}

/** Tanıma hatalarını öğrencinin anlayacağı Türkçeye çevirir. */
function errorText(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Mikrofon izni verilmedi. Ayarlar → Uygulama izinleri'nden açabilirsin.";
    case "no-speech":
      return "Ses duyulmadı — mikrofona biraz daha yakın konuş.";
    case "network":
      return "Ses tanıma için internet gerekti ve bağlanılamadı.";
    case "language-not-supported":
      return "Telefonun bu dili tanımıyor. Google uygulamasından dil paketini indirmen gerekebilir.";
    case "audio-capture":
      return "Mikrofona erişilemedi (başka bir uygulama kullanıyor olabilir).";
    default:
      return `Ses tanıma hatası (${code}).`;
  }
}

/** Basılı tutma bu süreden kısaysa yine de bu kadar dinlenir. */
const MIN_LISTEN_MS = 600;

export function useDictation(opts: DictationOptions): DictationState {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Sürekli kipte tanıma birden çok parça döndürebilir: kesinleşenler
   * biriktirilir, kesinleşmemiş son parça ayrı tutulur. Teslim yalnız
   * "end" olayında yapılır — yani öğrenci düğmeyi bıraktığında.
   */
  const finals = useRef<string[]>([]);
  const interim = useRef("");
  const delivered = useRef(false);
  const startedAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Eller serbest kipte sessizlik sayacı — her yeni parçada baştan kurulur. */
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilence = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  };

  /** Bir parça duyuldu: sessizlik sayacını (varsa) yeniden kur. */
  const armSilence = () => {
    if (!opts.autoStopMs) return;
    clearSilence();
    silenceTimer.current = setTimeout(() => {
      silenceTimer.current = null;
      doStop();
    }, opts.autoStopMs);
  };

  // Bekleyen gecikmeli durdurma ekran kapanınca da temizlenmeli: yoksa
  // zamanlayıcı sökülmüş bileşenin üstünde ateşler (setState uyarısı) ve
  // mikrofon açık kalabilir.
  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ekran zaten kapanıyor
      }
    },
    []
  );

  const reset = () => {
    finals.current = [];
    interim.current = "";
    delivered.current = false;
  };

  /** Toplanan her şeyi tek metne çevirir. */
  const collected = (): string => {
    const parts = [...finals.current];
    // Son ara metin bir kesinleşmiş parçanın tekrarı olabilir; öyleyse ekleme.
    const tail = interim.current.trim();
    if (tail && !parts.some((p) => p.trim() === tail)) parts.push(tail);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  const deliver = () => {
    if (delivered.current) return;
    const text = collected();
    if (!text) return;
    delivered.current = true;
    opts.onResult(text);
  };

  useSpeechRecognitionEvent("start", () => {
    setListening(true);
    setPartial("");
    reset();
  });

  useSpeechRecognitionEvent("result", (ev) => {
    const text = ev.results?.[0]?.transcript ?? "";
    if (ev.isFinal) {
      if (text.trim()) finals.current.push(text.trim());
      interim.current = "";
      // Sürekli kipte teslim ETME: öğrenci hâlâ konuşuyor olabilir.
      setPartial(collected());
    } else {
      interim.current = text;
      setPartial(collected());
    }
    // Eller serbest kip: parça geldi, sessizlik sayacı baştan.
    if (text.trim()) armSilence();
  });

  useSpeechRecognitionEvent("end", () => {
    clearSilence();
    setListening(false);
    setPartial("");
    deliver(); // bitiş kararı öğrencinin: düğmeyi bıraktı
  });

  useSpeechRecognitionEvent("error", (ev) => {
    clearSilence();
    setListening(false);
    setPartial("");
    const code = String(ev.error);
    // Elinde metin varken gelen "no-speech" gürültüdür: teslim et, hata gösterme.
    if (collected()) {
      deliver();
      return;
    }
    if (code !== "aborted") setError(errorText(code));
  });

  const start = () => {
    setError(null);
    reset();
    startedAt.current = Date.now();
    void (async () => {
      try {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          setError(errorText("not-allowed"));
          return;
        }
        ExpoSpeechRecognitionModule.start({
          lang: opts.lang ?? speechLocale(getActiveLanguageId()),
          interimResults: true,
          // Bırakana kadar dinle — duraksama "bitti" sayılmasın.
          continuous: true,
          maxAlternatives: 1,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  };

  const stop = () => {
    // Kazara kısa dokunuş: tanıma daha açılmadan kapatılırsa hiçbir şey
    // duyulmaz ve öğrenci "çalışmıyor" sanır. En az bu kadar dinle.
    const elapsed = Date.now() - startedAt.current;
    if (elapsed < MIN_LISTEN_MS) {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => doStop(), MIN_LISTEN_MS - elapsed);
      return;
    }
    doStop();
  };

  const doStop = () => {
    clearSilence();
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    try {
      // stop(): son sonucu isteyerek bitirir (abort değil — abort metni atar).
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // durdurma hatası önemsiz: "end" olayı yine de gelir
    }
    setListening(false);
  };

  return { listening, partial, error, start, stop };
}
