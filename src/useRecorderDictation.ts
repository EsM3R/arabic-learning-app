/**
 * KAYIT TABANLI DİNLEME — öğrencinin sesi ses modeline gider.
 *
 * useDictation telefonun tanımasını kullanır; hızlıdır ama Arapçada ve
 * Farsçada zayıf, ve aksanlı konuşmayı sık bozar. Bu kanca aynı arayüzü
 * (DictationState) sunar ama mikrofonu DOSYAYA kaydeder ve dosyayı ses
 * modelinin tanımasına (Gemini ya da OpenAI) yollar.
 *
 * Bedeli: canlı ara metin yok (tanıma bittikten sonra gelir) ve sıra geçme
 * kararı ses DÜZEYİNDEN verilir (src/voice.ts createSilenceGate). Konuşma
 * Odası bunu, öğrenci ses modelini seçtiğinde kullanır; ders ekranı yine
 * telefonun tanımasıyla çalışır.
 */
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { getActiveLanguageId } from "./languages";
import type { VoiceBackend } from "./neuralVoice";
import type { DictationState } from "./useDictation";
import { createSilenceGate, sttLanguage, sttSeconds } from "./voice";

export interface RecorderDictationOptions {
  /** Tanımayı yapacak arka uç; null ise kanca hiçbir şey yapmaz (hooks kuralı gereği yine çağrılır). */
  backend: VoiceBackend | null;
  onResult: (text: string) => void;
  /** Konuşma bittikten sonra sıra geçmeden önceki sessizlik. */
  silenceMs: number;
}

const POLL_MS = 150;
const NO_SPEECH_MS = 8000;
const MAX_MS = 45_000;

export function useRecorderDictation(opts: RecorderDictationOptions): DictationState {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopping = useRef(false);

  const clearPoll = () => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = null;
    }
  };

  useEffect(
    () => () => {
      clearPoll();
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        // ekran kapanıyor
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const finishAndTranscribe = async (gaveUp: boolean) => {
    if (stopping.current) return;
    stopping.current = true;
    clearPoll();
    let uri: string | null = null;
    let durationMs = 0;
    try {
      durationMs = recorder.getStatus().durationMillis;
      await recorder.stop();
      uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      // kayıt kapatılamadı: aşağıda boş sonuç döner
    }
    setListening(false);
    if (gaveUp || !uri) {
      setPartial("");
      opts.onResult("");
      return;
    }
    setPartial("çözülüyor…");
    try {
      if (!opts.backend) throw new Error("Ses tanıma arka ucu yok.");
      const text = await opts.backend.transcribe(
        uri,
        sttLanguage(getActiveLanguageId()),
        sttSeconds(durationMs)
      );
      setPartial("");
      opts.onResult(text);
    } catch (e) {
      setPartial("");
      setError(e instanceof Error ? e.message : String(e));
      opts.onResult("");
    }
  };

  const start = () => {
    if (!opts.backend) return;
    setError(null);
    setPartial("");
    stopping.current = false;
    void (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setError("Mikrofon izni verilmedi. Ayarlar → Uygulama izinleri'nden açabilirsin.");
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setListening(true);
        const gate = createSilenceGate({
          silenceMs: opts.silenceMs,
          noSpeechMs: NO_SPEECH_MS,
          maxMs: MAX_MS,
        });
        const t0 = Date.now();
        poll.current = setInterval(() => {
          let db: number | undefined;
          try {
            db = recorder.getStatus().metering;
          } catch {
            db = undefined;
          }
          const v = gate.sample(Date.now() - t0, db);
          if (gate.speechStarted) setPartial("dinliyorum…");
          if (v === "stop") void finishAndTranscribe(false);
          else if (v === "give-up") void finishAndTranscribe(true);
        }, POLL_MS);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setListening(false);
      }
    })();
  };

  const stop = () => {
    if (!listening) return;
    void finishAndTranscribe(false);
  };

  return { listening, partial, error, start, stop };
}
