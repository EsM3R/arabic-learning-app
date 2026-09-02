/**
 * Mikrofon kancası: cihazın kendi ses tanımasıyla konuşmayı yazıya çevirir.
 * API maliyeti YOKTUR — tanıma telefonda/Google servisinde yapılır.
 *
 * Saf mantık src/speechinput.ts'te; burada yalnız izin, başlat/durdur ve
 * olay tesisatı var.
 */
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useRef, useState } from "react";
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
  /** Kesin sonuç geldiğinde — asıl teslim noktası. */
  onResult: (text: string) => void;
  /** Hedef dil yerine Türkçe dinlemek için (kullanılmıyor ama açık kapı). */
  lang?: string;
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

export function useDictation(opts: DictationOptions): DictationState {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Son duyulan metin: bazı cihazlarda "end" olayı final sonuçtan sonra gelir. */
  const lastText = useRef("");
  const delivered = useRef(false);

  useSpeechRecognitionEvent("start", () => {
    setListening(true);
    setPartial("");
    lastText.current = "";
    delivered.current = false;
  });

  useSpeechRecognitionEvent("result", (ev) => {
    const text = ev.results?.[0]?.transcript ?? "";
    lastText.current = text;
    if (ev.isFinal) {
      setPartial("");
      if (!delivered.current && text.trim()) {
        delivered.current = true;
        opts.onResult(text.trim());
      }
    } else {
      setPartial(text);
    }
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    setPartial("");
    // Kesin sonuç gelmeden bittiyse (kimi Android sürümü böyle davranıyor)
    // elimizdeki son ara metni teslim et — yoksa öğrencinin konuşması kaybolur.
    if (!delivered.current && lastText.current.trim()) {
      delivered.current = true;
      opts.onResult(lastText.current.trim());
    }
  });

  useSpeechRecognitionEvent("error", (ev) => {
    setListening(false);
    setPartial("");
    // Kullanıcı bitirdiğinde de "no-speech" gelebiliyor; sonuç teslim
    // edildiyse hata göstermeye gerek yok.
    if (!delivered.current) setError(errorText(String(ev.error)));
  });

  const start = () => {
    setError(null);
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
          continuous: false,
          maxAlternatives: 1,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  };

  const stop = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // durdurma hatası önemsiz: "end" olayı yine de gelir
    }
    setListening(false);
  };

  return { listening, partial, error, start, stop };
}
