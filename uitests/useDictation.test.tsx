/**
 * Mikrofon kancası testi.
 *
 * Bu kanca uygulamanın KONUŞMA GİRİŞİ: her sesli alıştırma buradan geçiyor.
 * Ekran testlerinde taklit edildiği için bugüne kadar kendisi hiç
 * ölçülmemişti — yani konuşmanın giriş kapısı test edilmemiş tek parçaydı.
 *
 * Buradaki davranışların hepsi gerçek kullanımdan doğdu ve hepsi sessizce
 * bozulabilir:
 *
 * - TESLİM yalnız "end" olayında yapılır. Android varsayılan kipte kısa bir
 *   duraksamayı "cümle bitti" sayıyor; yabancı dilde yavaş konuşan biri
 *   cümlesini bitiremeden kesiliyordu. Bitişe artık makine değil öğrenci
 *   karar verir — her kesinleşen parçada teslim edilseydi bu tersine dönerdi
 *   ve hiçbir hata çıkmazdı, sadece cümleler yarım değerlendirilirdi.
 * - Elde metin varken gelen "no-speech" GÜRÜLTÜDÜR: hata göstermek, düzgün
 *   konuşmuş öğrenciye "seni duymadım" demek olurdu.
 * - Kazara kısa dokunuşta tanıma açılmadan kapanır; öğrenci "çalışmıyor"
 *   sanır. Asgari dinleme süresi bunun içindir.
 */
import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.unmock("../src/useDictation");

/** Kayıtlı olay dinleyicileri — testten ateşlenir. */
const mockHandlers: Record<string, ((ev: unknown) => void)[]> = {};
const mockMod = {
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
};
jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: () => mockMod.requestPermissionsAsync(),
    start: (o: unknown) => mockMod.start(o),
    stop: () => mockMod.stop(),
    abort: () => mockMod.abort(),
  },
  useSpeechRecognitionEvent: (name: string, fn: (ev: unknown) => void) => {
    const React = require("react");
    React.useEffect(() => {
      (mockHandlers[name] ??= []).push(fn);
      return () => {
        mockHandlers[name] = (mockHandlers[name] ?? []).filter((h) => h !== fn);
      };
    });
  },
}));

import { useDictation } from "../src/useDictation";
import { setActiveLanguage } from "../src/languages";

function fire(name: string, ev: unknown = {}) {
  act(() => {
    for (const h of [...(mockHandlers[name] ?? [])]) h(ev);
  });
}

/** Kesinleşmiş / kesinleşmemiş tanıma parçası. */
function result(transcript: string, isFinal: boolean) {
  return { results: [{ transcript }], isFinal };
}

const heard: string[] = [];
let api: { listening: boolean; partial: string; error: string | null; start: () => void; stop: () => void };

function Host({ lang }: { lang?: string }) {
  api = useDictation({ onResult: (t) => heard.push(t), lang });
  return <Text>{`${api.listening ? "dinliyor" : "kapalı"}|${api.partial}|${api.error ?? ""}`}</Text>;
}

function mount(lang?: string) {
  return render(<Host lang={lang} />);
}

beforeEach(() => {
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
  heard.length = 0;
  mockMod.requestPermissionsAsync.mockReset();
  mockMod.requestPermissionsAsync.mockResolvedValue({ granted: true });
  mockMod.start.mockReset();
  mockMod.stop.mockReset();
  mockMod.abort.mockReset();
  setActiveLanguage("ar");
  jest.useRealTimers();
});

// --- teslim zamanlaması ------------------------------------------------------

test("kesinleşen parça TESLİM ETMEZ — öğrenci hâlâ konuşuyor olabilir", async () => {
  mount();
  fire("start");
  fire("result", result("البيت", true));
  expect(heard).toHaveLength(0); // henüz bırakmadı
  fire("end");
  expect(heard).toEqual(["البيت"]);
});

test("birden çok parça TEK cümlede birleşir", async () => {
  mount();
  fire("start");
  fire("result", result("البيت", true));
  fire("result", result("كبير", true));
  fire("result", result("جدا", false));
  fire("end");
  expect(heard).toEqual(["البيت كبير جدا"]);
});

test("ara metin kesinleşmiş parçayı TEKRARLIYORSA iki kez yazılmaz", async () => {
  // Bazı motorlar son parçayı hem ara hem kesin olarak gönderiyor.
  mount();
  fire("start");
  fire("result", result("البيت", true));
  fire("result", result("البيت", false));
  fire("end");
  expect(heard).toEqual(["البيت"]);
});

test("teslim BİR KEZ yapılır", async () => {
  mount();
  fire("start");
  fire("result", result("البيت", true));
  fire("end");
  fire("end");
  expect(heard).toHaveLength(1);
});

test("hiç ses duyulmadıysa boş metin teslim EDİLMEZ", async () => {
  // Boş dize hedefle karşılaştırılsaydı "uzak" hükmü çıkar ve öğrenci
  // konuşmadığı hâlde başarısız sayılırdı.
  mount();
  fire("start");
  fire("end");
  expect(heard).toHaveLength(0);
});

test("konuşurken ARA METİN ekrana akar", async () => {
  const { getByText } = mount();
  fire("start");
  fire("result", result("البي", false));
  expect(getByText(/dinliyor\|البي\|/)).toBeTruthy();
});

// --- hatalar ----------------------------------------------------------------

test("elde metin varken gelen 'no-speech' hata DEĞİL, teslimdir", async () => {
  // Düzgün konuşmuş öğrenciye "seni duymadım" demek olurdu.
  const { getByText } = mount();
  fire("start");
  fire("result", result("البيت", true));
  fire("error", { error: "no-speech" });
  expect(heard).toEqual(["البيت"]);
  expect(getByText(/\|\|$/)).toBeTruthy(); // hata metni yok
});

test("elde metin yokken 'no-speech' ANLAŞILIR Türkçe söyler", async () => {
  const { getByText } = mount();
  fire("start");
  fire("error", { error: "no-speech" });
  expect(getByText(/mikrofona biraz daha yakın/)).toBeTruthy();
});

test("'aborted' öğrenciye hata olarak gösterilmez", async () => {
  // İptal öğrencinin kendi hamlesi; hata gibi sunmak kafa karıştırır.
  const { getByText } = mount();
  fire("start");
  fire("error", { error: "aborted" });
  expect(getByText(/\|\|$/)).toBeTruthy();
});

test("bilinmeyen hata kodu bile ÇIPLAK bırakılmaz", async () => {
  const { getByText } = mount();
  fire("error", { error: "uydurma-kod" });
  expect(getByText(/Ses tanıma hatası \(uydurma-kod\)/)).toBeTruthy();
});

test("dil paketi eksikse ne YAPILACAĞI söylenir", async () => {
  const { getByText } = mount();
  fire("error", { error: "language-not-supported" });
  expect(getByText(/dil paketini indirmen/)).toBeTruthy();
});

// --- başlatma ---------------------------------------------------------------

test("izin verilmezse tanıma BAŞLATILMAZ ve yol gösterilir", async () => {
  mockMod.requestPermissionsAsync.mockResolvedValue({ granted: false });
  const { getByText } = mount();
  await act(async () => {
    api.start();
  });
  expect(mockMod.start).not.toHaveBeenCalled();
  expect(getByText(/Ayarlar → Uygulama izinleri/)).toBeTruthy();
});

test("tanıma SÜREKLİ kipte açılır — duraksama 'bitti' sayılmaz", async () => {
  // Tasarımın tamamı buna dayanıyor: bu bayrak düşerse yavaş konuşan öğrenci
  // cümlesini bitiremeden kesilir ve kimse sebebini anlamaz.
  mount();
  await act(async () => {
    api.start();
  });
  expect(mockMod.start).toHaveBeenCalledTimes(1);
  const opts = mockMod.start.mock.calls[0][0] as { continuous: boolean; lang: string; interimResults: boolean };
  expect(opts.continuous).toBe(true);
  expect(opts.interimResults).toBe(true);
  expect(opts.lang).toBe("ar-SA");
});

test("istenen dil hedef dili EZER", async () => {
  mount("tr-TR");
  await act(async () => {
    api.start();
  });
  expect((mockMod.start.mock.calls[0][0] as { lang: string }).lang).toBe("tr-TR");
});

// --- kazara kısa dokunuş ----------------------------------------------------

test("çok kısa dokunuşta durdurma ERTELENİR — 'çalışmıyor' sanılmasın", async () => {
  jest.useFakeTimers();
  mount();
  await act(async () => {
    api.start();
  });
  act(() => {
    api.stop();
  });
  expect(mockMod.stop).not.toHaveBeenCalled(); // henüz erken

  act(() => {
    jest.advanceTimersByTime(600);
  });
  expect(mockMod.stop).toHaveBeenCalledTimes(1);
});

test("ekran kapanınca mikrofon AÇIK KALMAZ", async () => {
  jest.useFakeTimers();
  const { unmount } = mount();
  await act(async () => {
    api.start();
  });
  act(() => {
    api.stop(); // bekleyen gecikmeli durdurma bırakıyoruz
  });
  unmount();
  expect(mockMod.abort).toHaveBeenCalledTimes(1);

  // Sökülmüş bileşenin üstünde zamanlayıcı ateşlememeli.
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(mockMod.stop).not.toHaveBeenCalled();
});

// --- eller serbest kip (Konuşma Odası) ---------------------------------------

test("ELLER SERBEST: öğrenci susunca dinleme kendi kapanır ve teslim edilir", async () => {
  // Gerçek konuşmadaki gibi: düğme yok, susunca sıra geçer.
  jest.useFakeTimers();
  function HostAuto() {
    api = useDictation({ onResult: (t) => heard.push(t), autoStopMs: 2000 });
    return <Text>{api.listening ? "dinliyor" : "kapalı"}</Text>;
  }
  render(<HostAuto />);
  fire("start");
  fire("result", result("البيت", false));
  act(() => {
    jest.advanceTimersByTime(1500);
  });
  expect(mockMod.stop).not.toHaveBeenCalled(); // henüz sessizlik dolmadı
  fire("result", result("البيت كبير", false)); // konuşmaya devam etti → sayaç baştan
  act(() => {
    jest.advanceTimersByTime(1500);
  });
  expect(mockMod.stop).not.toHaveBeenCalled();
  act(() => {
    jest.advanceTimersByTime(600);
  });
  expect(mockMod.stop).toHaveBeenCalledTimes(1); // 2 sn sessizlik → kapandı
});

test("ELLER SERBEST: hiç ses gelmediyse sayaç ÇALIŞMAZ — boş odada kapanıp durmasın", async () => {
  jest.useFakeTimers();
  function HostAuto() {
    api = useDictation({ onResult: (t) => heard.push(t), autoStopMs: 2000 });
    return <Text>x</Text>;
  }
  render(<HostAuto />);
  fire("start");
  act(() => {
    jest.advanceTimersByTime(10_000);
  });
  expect(mockMod.stop).not.toHaveBeenCalled();
});

test("basılı-tut kipinde (autoStopMs yok) sessizlik sayacı hiç kurulmaz", async () => {
  // Yavaş konuşan öğrenci kesilmesin diye bitişe orada öğrenci karar verir.
  jest.useFakeTimers();
  mount();
  fire("start");
  fire("result", result("البيت", false));
  act(() => {
    jest.advanceTimersByTime(30_000);
  });
  expect(mockMod.stop).not.toHaveBeenCalled();
});

// --- n-best (Cümle Kurma) --------------------------------------------------------

/** Birden çok duyuşlu (n-best) parça. */
function resultAlts(transcripts: string[], isFinal: boolean) {
  return { results: transcripts.map((transcript) => ({ transcript })), isFinal };
}

test("varsayılan: tek duyuş istenir, alts yalnız teslim edilen metindir", async () => {
  const got: string[][] = [];
  function HostOne() {
    api = useDictation({ onResult: (_t, alts) => got.push(alts) });
    return <Text>x</Text>;
  }
  render(<HostOne />);
  await act(async () => {
    api.start();
  });
  expect((mockMod.start.mock.calls[0][0] as { maxAlternatives: number }).maxAlternatives).toBe(1);
  fire("start");
  fire("result", resultAlts(["I turn on TV", "I turn on the TV"], true));
  fire("end");
  expect(got).toEqual([["I turn on TV"]]);
});

test("maxAlternatives 3: her parçanın k. duyuşu birleşir, ilk eleman teslim edilen metin", async () => {
  const got: { text: string; alts: string[] }[] = [];
  function HostNBest() {
    api = useDictation({ onResult: (text, alts) => got.push({ text, alts }), maxAlternatives: 3 });
    return <Text>x</Text>;
  }
  render(<HostNBest />);
  await act(async () => {
    api.start();
  });
  expect((mockMod.start.mock.calls[0][0] as { maxAlternatives: number }).maxAlternatives).toBe(3);
  fire("start");
  fire("result", resultAlts(["I turn on", "I turn on"], true));
  fire("result", resultAlts(["TV", "the TV", "a TV"], true));
  fire("end");
  expect(got).toHaveLength(1);
  expect(got[0].text).toBe("I turn on TV");
  // İkinci parçanın 2. ve 3. duyuşu; ilk parçada 3. duyuş yoksa ilki kullanılır.
  expect(got[0].alts).toEqual(["I turn on TV", "I turn on the TV", "I turn on a TV"]);
});
