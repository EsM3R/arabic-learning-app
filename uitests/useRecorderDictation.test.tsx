/**
 * Kayıt tabanlı dinleme — öğrencinin sesi ses modeline gider.
 *
 * Burada "öğrenci sustu" kararı ses DÜZEYİNDEN veriliyor (canlı ara metin
 * yok). Kapı mantığı tests/voice.test.ts'te; burada ölçülen şey kancanın o
 * kararı gerçekten uyguladığı: kaydı durdurup dosyayı tanımaya yollaması ve
 * metni teslim etmesi. Bir de para dikişi: hiç konuşulmamış kayıt tanımaya
 * GİTMEZ — boş dosya için ödeme yapılmaz.
 */
import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { useRecorderDictation } from "../src/useRecorderDictation";
import { openaiBackend } from "../src/openaiVoice";
import { setActiveLanguage } from "../src/languages";

const mockFetch = jest.fn();
jest.mock("expo/fetch", () => ({ fetch: (...a: unknown[]) => mockFetch(...a) }));

type Rec = {
  isRecording: boolean;
  uri: string | null;
  permission: boolean;
  prepared: number;
  metering: number | undefined;
  durationMillis: number;
};
const rec = () => (global as unknown as { __recorder: Rec }).__recorder;

const heard: string[] = [];
let api: { listening: boolean; partial: string; error: string | null; start: () => void; stop: () => void };

function Host({ enabled = true }: { enabled?: boolean }) {
  api = useRecorderDictation({
    backend: enabled ? openaiBackend("sk-x", "ash") : null,
    silenceMs: 2000,
    onResult: (t) => heard.push(t),
  });
  return <Text>{`${api.listening ? "dinliyor" : "kapalı"}|${api.partial}|${api.error ?? ""}`}</Text>;
}

/** İzin ve hazırlık sözleri çözülsün, kayıt başlasın. */
async function startAndSettle() {
  await act(async () => {
    api.start();
  });
  await act(async () => {});
}

beforeEach(() => {
  jest.useFakeTimers();
  heard.length = 0;
  mockFetch.mockReset();
  mockFetch.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ text: "البيت كبير" }),
  }));
  const r = rec();
  r.isRecording = false;
  r.uri = null;
  r.permission = true;
  r.prepared = 0;
  r.metering = -60;
  r.durationMillis = 0;
  const fs = (global as unknown as { __fs: Map<string, unknown> }).__fs;
  fs.set("file:///rec.m4a", new Uint8Array([1, 2, 3]));
  setActiveLanguage("ar");
});
afterEach(() => jest.useRealTimers());

test("konuşup susunca kayıt durur, dosya tanımaya gider, metin teslim edilir", async () => {
  render(<Host />);
  await startAndSettle();
  expect(rec().isRecording).toBe(true);

  rec().metering = -20; // konuşuyor
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  rec().metering = -60; // sustu
  rec().durationMillis = 3200;
  await act(async () => {
    jest.advanceTimersByTime(2400);
  });
  await act(async () => {});
  await act(async () => {});

  expect(rec().isRecording).toBe(false);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(String(mockFetch.mock.calls[0][0])).toMatch(/transcriptions/);
  expect(heard).toEqual(["البيت كبير"]);
});

test("düşünme duraksaması sırayı GEÇİRMEZ", async () => {
  render(<Host />);
  await startAndSettle();
  rec().metering = -20;
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  rec().metering = -60;
  await act(async () => {
    jest.advanceTimersByTime(1500); // 1,5 sn — eşik 2 sn
  });
  rec().metering = -20; // devam etti
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(rec().isRecording).toBe(true);
  expect(mockFetch).not.toHaveBeenCalled();
});

test("HİÇ konuşulmazsa vazgeçilir ve tanımaya GİDİLMEZ — boş dosyaya ödeme yok", async () => {
  render(<Host />);
  await startAndSettle();
  await act(async () => {
    jest.advanceTimersByTime(8500);
  });
  await act(async () => {});
  expect(mockFetch).not.toHaveBeenCalled();
  expect(heard).toEqual([""]); // boş teslim: ekran sırayı öğrencide tutar
  expect(rec().isRecording).toBe(false);
});

test("tanıma çökerse hata gösterilir ve boş teslim edilir — ekran kilitlenmez", async () => {
  mockFetch.mockImplementation(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "servis yok" } }),
  }));
  const { getByText } = render(<Host />);
  await startAndSettle();
  rec().metering = -20;
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  rec().metering = -60;
  await act(async () => {
    jest.advanceTimersByTime(2400);
  });
  await act(async () => {});
  await act(async () => {});
  expect(heard).toEqual([""]);
  expect(getByText(/servis yok/)).toBeTruthy();
});

test("izin yoksa kayıt başlamaz ve yol gösterilir", async () => {
  rec().permission = false;
  const { getByText } = render(<Host />);
  await startAndSettle();
  expect(rec().prepared).toBe(0);
  expect(getByText(/Uygulama izinleri/)).toBeTruthy();
});

test("etkin değilken start() hiçbir şey yapmaz — telefon tanıması devrede", async () => {
  render(<Host enabled={false} />);
  await startAndSettle();
  expect(rec().prepared).toBe(0);
  expect(rec().isRecording).toBe(false);
});

test("elle stop() da tanımaya gönderir", async () => {
  render(<Host />);
  await startAndSettle();
  rec().metering = -20;
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await act(async () => {
    api.stop();
  });
  await act(async () => {});
  await act(async () => {});
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(heard).toEqual(["البيت كبير"]);
});
