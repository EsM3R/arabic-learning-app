/**
 * Cümle Kurma ekranı testi.
 *
 * Yöntem kullanıcının getirdiği videodan: Türkçe cümle ana fiilden başlayıp
 * parça parça kurulur. Ekranın dikişleri:
 * - adım adım ilerleme (yanlışta aynı adım tekrarlanır, atlanmaz),
 * - her adımda doğrusu SESLİ duyulur,
 * - cümle bitince yapı taşları ve karışıklık notu gösterilir,
 * - bağlacın yeri değişen cümlede ek adım söyletilir,
 * - set saklanır ve ikinci kez BEDAVA açılır (para dikişi),
 * - ilerleme diske yazılır.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import SentenceBuildScreen from "../src/screens/SentenceBuildScreen";
import { setActiveLanguage } from "../src/languages";
import { loadBuildProgress, loadBuildSets, loadVocab } from "../src/storage";
import { flushStats, loadStatsSummary } from "../src/statsStore";
import type { Profile } from "../src/types";

const mockGen = jest.fn();
jest.mock("../src/claude", () => ({
  generateBuildSet: (...a: unknown[]) => mockGen(...a),
}));

/** Videodaki ikinci cümle — üç sentence'lık set (en az 3 şart değil ama gerçekçi). */
function videoSet(patternId: string, themeId: string) {
  return {
    patternId,
    themeId,
    intro: "Günlük rutin",
    createdAt: "2026-09-29T00:00:00.000Z",
    sentences: [
      {
        tr: "Kahvaltı yapmadan önce duş alırım.",
        steps: [
          { question: "", trPiece: "duş alırım", trSoFar: "duş alırım", target: "I take a shower", alts: ["I have a shower"], translit: "", note: "duş almak = take a shower" },
          { question: "Ne zaman?", trPiece: "kahvaltı yapmadan önce", trSoFar: "Kahvaltı yapmadan önce duş alırım.", target: "Before I have breakfast, I take a shower.", alts: [], translit: "", note: "-madan önce = before" },
        ],
        blocks: [{ target: "before", tr: "-madan önce", note: "iki eylemi bağlar", contrast: "ago sadece 'önce' demek: three days ago", alts: [] }],
        reorder: "I take a shower before I have breakfast.",
      },
      {
        tr: "Eve vardığımda televizyonu açarım.",
        steps: [
          { question: "", trPiece: "televizyonu açarım", trSoFar: "televizyonu açarım", target: "I turn on the TV", alts: [], translit: "", note: "elektronik: turn on" },
          { question: "Ne zaman?", trPiece: "eve vardığımda", trSoFar: "Eve vardığımda televizyonu açarım.", target: "When I arrive at home, I turn on the TV.", alts: [], translit: "", note: "-dığımda = when" },
        ],
        blocks: [{ target: "turn on", tr: "açmak (cihaz)", note: "", contrast: "open kapı/pencere için", alts: [] }],
        reorder: "",
      },
    ],
  };
}

const profile = {
  name: "Mehmet",
  apiKey: "sk-ant-x",
  completedModuleIds: [],
  assessment: { speakingLevel: "A1", readingLevel: "A1", strengths: [], weaknesses: [], summary: "" },
} as unknown as Profile;

type Btn = { text?: string; onPress?: () => void };
const alerts: { title?: string; buttons?: Btn[] }[] = [];

beforeEach(async () => {
  alerts.length = 0;
  mockGen.mockReset();
  mockGen.mockImplementation(async (_p: unknown, pattern: { id: string }, theme: { id: string }) =>
    videoSet(pattern.id, theme.id)
  );
  setActiveLanguage("en");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  require("expo-speech").speak.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation((title?: string, _b?: string, buttons?: Btn[]) => {
    alerts.push({ title, buttons });
  });
});

async function openAndStart() {
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/Günlük rutinim/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Günlük rutinim/));
  const ok = alerts[alerts.length - 1].buttons!.find((b) => /Evet/.test(b.text ?? ""))!;
  await act(async () => {
    ok.onPress?.();
  });
  // Yapı taşları cümleden ÖNCE — videodaki hoca da önce anlatıp sonra çevirir.
  await waitFor(() => expect(screen.getByText(/Bu cümlede öğreneceklerin/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Kurmaya başla/));
  await waitFor(() => expect(screen.getByText(/Bu adımda ekle/)).toBeTruthy());
}

function say(text: string) {
  fireEvent.changeText(screen.getByPlaceholderText(/ya da yaz/), text);
  fireEvent.press(screen.getByText("Kontrol et"));
}

test("ekranı açmak istek harcamaz; yeni set ONAY ister", async () => {
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/ŞİMDİKİ KALIP/)).toBeTruthy());
  expect(mockGen).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(/Günlük rutinim/));
  expect(alerts[0].title).toMatch(/Yeni set/);
  expect(mockGen).not.toHaveBeenCalled();
});

test("ilk adım ANA YÜKLEM: Türkçe parça gösterilir, cevap gizli", async () => {
  await openAndStart();
  expect(screen.getByText("duş alırım")).toBeTruthy();
  expect(screen.queryByText(/I take a shower/)).toBeNull();
});

test("doğru cevap kabul edilir, doğrusu SESLİ okunur, alternatif de doğrudur", async () => {
  await openAndStart();
  say("I have a shower"); // alternatif
  await waitFor(() => expect(screen.getByText("✓ Doğru")).toBeTruthy());
  expect(require("expo-speech").speak).toHaveBeenCalled();
  expect(screen.getByText(/Ayrıca doğru: I have a shower/)).toBeTruthy();
});

test("YANLIŞ cevapta adım atlanmaz — aynı adım bir daha söyletilir", async () => {
  await openAndStart();
  say("I shower take");
  await waitFor(() => expect(screen.getByText(/✗ Doğrusu/)).toBeTruthy());
  expect(screen.queryByText(/Devam/)).toBeNull();
  fireEvent.press(screen.getByText(/Bir daha söyle/));
  expect(screen.getByText("duş alırım")).toBeTruthy(); // hâlâ ilk adım
});

test("cümle adım adım BÜYÜR, bağlaç ortaya alınarak ek adım söyletilir", async () => {
  await openAndStart();
  say("I take a shower");
  await waitFor(() => expect(screen.getByText(/Devam/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Devam/));
  expect(screen.getByText("kahvaltı yapmadan önce")).toBeTruthy();
  expect(screen.getByText("Ne zaman?")).toBeTruthy(); // videodaki gibi: soruyla büyüt
  expect(screen.getByText(/önceki: I take a shower/)).toBeTruthy();

  say("before I have breakfast, I take a shower");
  await waitFor(() => expect(screen.getByText(/Devam/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Devam/));
  expect(screen.getByText(/bağlacı ORTAYA alarak/)).toBeTruthy();

  say("I take a shower before I have breakfast");
  await waitFor(() => expect(screen.getByText("✓ Doğru")).toBeTruthy());
});

test("YAPI TAŞI ve KARIŞIKLIK notu cümleye BAŞLAMADAN gösterilir", async () => {
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/Günlük rutinim/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Günlük rutinim/));
  const ok = alerts[alerts.length - 1].buttons!.find((b) => /Evet/.test(b.text ?? ""))!;
  await act(async () => {
    ok.onPress?.();
  });
  await waitFor(() => expect(screen.getByText(/= -madan önce/)).toBeTruthy());
  expect(screen.getByText(/ago sadece 'önce' demek/)).toBeTruthy();
  expect(screen.queryByText(/Bu adımda ekle/)).toBeNull(); // henüz kurulum yok
});

test("cümle bitince tam hâli, bağlacın öteki yeri ve özet gösterilir", async () => {
  await openAndStart();
  for (const t of [
    "I take a shower",
    "Before I have breakfast, I take a shower.",
    "I take a shower before I have breakfast.",
  ]) {
    say(t);
    await waitFor(() => expect(screen.getByText(/Devam/)).toBeTruthy());
    fireEvent.press(screen.getByText(/Devam/));
  }
  await waitFor(() => expect(screen.getByText(/ya da: I take a shower before/)).toBeTruthy());
  expect(screen.getByText(/✓ before = -madan önce/)).toBeTruthy();
});

test("set SAKLANIR ve ikinci açılışta BEDAVA gelir", async () => {
  await openAndStart();
  expect(mockGen).toHaveBeenCalledTimes(1);
  await waitFor(async () => expect(await loadBuildSets()).toHaveLength(1));
  screen.unmount();

  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("hazır")).toBeTruthy());
  fireEvent.press(screen.getByText("Günlük rutinim")); // tema kartı (kayıtlı listede de geçiyor)
  await waitFor(() => expect(screen.getByText(/Kurmaya başla/)).toBeTruthy());
  expect(mockGen).toHaveBeenCalledTimes(1); // yeni istek yok
});

test("ilerleme diske yazılır; biten cümle sayılır", async () => {
  await openAndStart();
  for (const t of [
    "I take a shower",
    "Before I have breakfast, I take a shower.",
    "I take a shower before I have breakfast.",
  ]) {
    say(t);
    await waitFor(() => expect(screen.getByText(/Devam/)).toBeTruthy());
    fireEvent.press(screen.getByText(/Devam/));
  }
  await waitFor(async () => {
    const p = await loadBuildProgress<Record<string, { attempts: number; sentencesDone: number }>>();
    const entry = Object.values(p)[0];
    expect(entry.attempts).toBe(3);
    expect(entry.sentencesDone).toBe(1);
  });
  await flushStats();
  expect((await loadStatsSummary()).total.sentenceBuilt).toBe(1);
});

test("set sonunda yapı taşları DEFTERE eklenir", async () => {
  await openAndStart();
  const steps = [
    "I take a shower",
    "Before I have breakfast, I take a shower.",
    "I take a shower before I have breakfast.",
  ];
  for (const t of steps) {
    say(t);
    await waitFor(() => expect(screen.getByText(/Devam/)).toBeTruthy());
    fireEvent.press(screen.getByText(/Devam/));
  }
  fireEvent.press(screen.getByText(/Sıradaki cümle/));
  await waitFor(() => expect(screen.getByText(/open kapı\/pencere için/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Kurmaya başla/));
  for (const t of ["I turn on the TV", "When I arrive at home, I turn on the TV."]) {
    say(t);
    await waitFor(() => expect(screen.getByText(/Devam/)).toBeTruthy());
    fireEvent.press(screen.getByText(/Devam/));
  }
  fireEvent.press(screen.getByText(/Seti bitir/));
  await waitFor(() => expect(screen.getByText(/2 cümle kurdun/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Yapı taşlarını deftere ekle/));
  await waitFor(async () => {
    const cards = await loadVocab();
    expect(cards.map((c) => c.arabic).sort()).toEqual(["before", "turn on"]);
  });
});

test("üretim hatası ekranı kilitlemez", async () => {
  mockGen.mockRejectedValueOnce(new Error("Set beklenenden kısa geldi"));
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/Günlük rutinim/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Günlük rutinim/));
  const ok = alerts[0].buttons!.find((b) => /Evet/.test(b.text ?? ""))!;
  await act(async () => {
    ok.onPress?.();
  });
  await waitFor(() => expect(alerts.some((a) => /hazırlanamadı/.test(a.title ?? ""))).toBe(true));
  expect(screen.getByText(/Günlük rutinim/)).toBeTruthy(); // seçime döndü
});
