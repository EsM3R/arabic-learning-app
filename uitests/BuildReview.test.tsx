/**
 * Cümle Kurma — tekrar, kalıp merdiveni ve yerleştirme (tasarım §6, §9).
 *
 * Ölçülen dikişler:
 * - "Tekrar zamanı (n)" vadesi gelen cümlelerde görünür; tek seferde doğru
 *   cümle takvimde ilerler ve kalıba "review" kanıtı yazar;
 * - yanlışta saklanan rehberli adımlar açılır ama yedek HİÇBİR ŞEY saymaz;
 * - merdivenden seçilen kalıp odak olur, "Sına ve geç" 3/4 ile verify yapar;
 * - doğrulanacak kalıp "Doğrula" ile bir doğru tekrarda oturur;
 * - A2+ öğrenciye yerleştirme önerilir, ilk kalan kalıp odak olur;
 * - merdiven bitince karma set önerilir.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import SentenceBuildScreen from "../src/screens/SentenceBuildScreen";
import { DEFAULT_BUILD_UI, memoryItem, newProgress } from "../src/buildmastery";
import type { PatternProgress, ProgressMap2 } from "../src/buildmastery";
import { setActiveLanguage } from "../src/languages";
import { PATTERN_LADDER } from "../src/sentencebuilding";
import type { Pattern } from "../src/sentencebuilding";
import { loadBuildMemory, loadBuildProgress2, loadBuildUi, saveBuildMemory, saveBuildProgress2, saveBuildUi } from "../src/storage";
import type { Profile } from "../src/types";
import { videoSet } from "./fixtures/videoSet";

const mockStartSet = jest.fn();
jest.mock("../src/buildpipeline", () => ({
  startSet: (...a: unknown[]) => mockStartSet(...a),
  continueSet: async () => ({ set: null }),
  resumePending: async () => null,
  isGenerating: () => false,
}));
const mockProbe = jest.fn();
jest.mock("../src/claude", () => ({
  generateMoreTransfer: async () => [],
  generateProbe: (...a: unknown[]) => mockProbe(...a),
}));

declare const global: { __dictation: { opts: { onResult: (t: string, a: string[]) => void } | null } };

const profileAt = (speakingLevel: string) =>
  ({
    name: "Mehmet",
    apiKey: "sk-ant-x",
    completedModuleIds: [],
    assessment: { speakingLevel, readingLevel: "A1", strengths: [], weaknesses: [], summary: "" },
  }) as unknown as Profile;

type Btn = { text?: string; onPress?: () => void };
const alerts: { title?: string; buttons?: Btn[] }[] = [];

const PAST = "2026-01-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";
/** Yoklama cümlesi: her kalıptan istenen sayıda, hep aynı kısa cümle. */
const PROBE_T = "I drink tea";

beforeEach(async () => {
  alerts.length = 0;
  mockStartSet.mockReset();
  mockProbe.mockReset();
  mockStartSet.mockImplementation(async (input: { confirm?: (n: string, k: number) => Promise<boolean> }) => {
    await input.confirm?.("1 plan + 6 cümle", 6);
    return null;
  });
  mockProbe.mockImplementation(async (_p: Profile, patterns: Pattern[], opts: { perPattern?: number }) =>
    patterns.flatMap((p) => Array.from({ length: opts.perPattern ?? 2 }, (_, k) => ({ pid: p.id, tr: `Çay içerim (${p.id} ${k + 1})`, target: PROBE_T, swaps: [] })))
  );
  setActiveLanguage("en");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  await saveBuildUi({ ...DEFAULT_BUILD_UI, fastFlow: false });
  jest.spyOn(Alert, "alert").mockImplementation((title?: string, _b?: string, buttons?: Btn[]) => {
    alerts.push({ title, buttons });
  });
});

async function pressAlert(re: RegExp) {
  await waitFor(() => expect(alerts.length).toBeGreaterThan(0));
  const b = alerts[alerts.length - 1].buttons?.find((x) => re.test(x.text ?? ""));
  await act(async () => {
    b?.onPress?.();
  });
}

async function say(text: string) {
  await act(async () => {
    global.__dictation.opts!.onResult(text, [text]);
  });
}

async function press(label: RegExp | string) {
  await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  fireEvent.press(screen.getByText(label));
}

const prog = (status: PatternProgress["status"], due?: string, over: Partial<PatternProgress> = {}): PatternProgress => ({
  ...newProgress(PAST),
  status,
  srs: { stage: 0, lapses: 0, due },
  ...over,
});

/** Videonun ilk cümlesi, vadesi geçmiş bir tekrar kaydı olarak. */
async function dueMemory(patternId = "olmak", dueAt = PAST) {
  const item = memoryItem(videoSet({ patternId, only: [0] }), 0, dueAt)!;
  await saveBuildMemory([item]);
  return item;
}

const S0 = ["I like", "I like to wake up", "I like to wake up early", "I like to wake up early in the morning."];

// ---------------------------------------------------------------------------

test("Tekrar zamanı: vadesi gelen cümle tek seferde; doğruysa takvim ilerler ve kalıba tekrar kanıtı yazılır", async () => {
  await dueMemory();
  render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await press("Tekrar zamanı (1)");
  await waitFor(() => expect(screen.getByText("Tek seferde söyle")).toBeTruthy());
  expect(screen.getByText("Sabahları erken uyanmayı seviyorum.")).toBeTruthy();
  expect(screen.queryByText(/I like/)).toBeNull();
  await say(S0[3]);
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await press("Bitir");
  await waitFor(() => expect(screen.getByText("1 cümleden 1'i ilk seferde doğru")).toBeTruthy());
  await press("Bitti");
  await waitFor(() => expect(screen.getByText(/SIRADAKİ KALIP/)).toBeTruthy());
  const [mem] = await loadBuildMemory();
  expect(mem.stage).toBe(1);
  expect(mem.lapses).toBe(0);
  const p = (await loadBuildProgress2()).olmak;
  expect(p.proof.map((e) => [e.k, e.ok])).toEqual([["review", 1]]);
  expect(p.proofKeys).toEqual([mem.key]);
  expect(screen.queryByText(/Tekrar zamanı \(/)).toBeNull();
});

test("tekrarda kayıtlı eşdeğer söyleyiş de doğru sayılır", async () => {
  const item = memoryItem(videoSet({ patternId: "olmak", only: [0] }), 0, PAST)!;
  await saveBuildMemory([{ ...item, alts: ["I love waking up early in the morning."] }]);
  render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await press("Tekrar zamanı (1)");
  await waitFor(() => expect(screen.getByText("Tek seferde söyle")).toBeTruthy());
  await say("I love waking up early in the morning.");
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await press("Bitir");
  await waitFor(() => expect(screen.getByText("1 cümleden 1'i ilk seferde doğru")).toBeTruthy());
});

test("tekrarda yanlış: saklanan adımlar açılır; yedek pratik, yalnız ilk deneme yazılır", async () => {
  await dueMemory();
  render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await press("Tekrar zamanı (1)");
  await say("I want coffee");
  await waitFor(() => expect(screen.getByText("Olmadı — adım adım kuralım")).toBeTruthy());
  // Doğrusu gösterilmez: adımlar birlikte kuracak.
  expect(screen.queryByText(/wake up/)).toBeNull();
  await press("Adım adım kur");
  await waitFor(() => expect(screen.getByText("Kim seviyor?")).toBeTruthy());
  expect(screen.getByText(/pratik/)).toBeTruthy();
  for (let i = 0; i < S0.length; i += 1) {
    await say(S0[i]);
    await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
    await press(i + 1 < S0.length ? "Devam" : "Sıradaki");
  }
  await waitFor(() => expect(screen.getByText("1 cümleden 0'i ilk seferde doğru")).toBeTruthy());
  await press("Bitti");
  const [mem] = await loadBuildMemory();
  expect(mem.stage).toBe(0);
  expect(mem.lapses).toBe(1);
  const p = (await loadBuildProgress2()).olmak;
  expect(p.proof.map((e) => [e.k, e.ok])).toEqual([["review", 0]]);
  expect(p.learn.attempts).toBe(0);
  expect(p.proofKeys).toEqual([]);
});

test("'sayma': yanlış duyulan tekrar denemesi iz bırakmaz", async () => {
  await dueMemory();
  render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await press("Tekrar zamanı (1)");
  await say("I like to wake up early in the morning");
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Ses tanıma yanlış duydu, sayma"));
  await waitFor(() => expect(screen.getByText("Cümlenin tamamını bir kerede söyle.")).toBeTruthy());
  await say("I want coffee");
  await press("Geç");
  await press("Bitti");
  expect((await loadBuildProgress2()).olmak.proof.map((e) => e.ok)).toEqual([0]);
});

test("kalıp merdiveni: seçilen kalıp odak olur; 'Merdivene dön' seçimi kaldırır", async () => {
  render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/SIRADAKİ KALIP · A1/)).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Kalıp merdiveni"));
  await press("A2");
  fireEvent.press(screen.getByLabelText("Kalıp: …-meyi seviyorum"));
  await press("Bunu çalış");
  await waitFor(() => expect(screen.getByText("SEÇTİĞİN KALIP · A2")).toBeTruthy());
  expect(screen.getByText("…-meyi seviyorum")).toBeTruthy();
  expect((await loadBuildUi()).focusOverride).toBe("sevmek");
  // Seçilen kalıbın hikâyesi seçilince set o kalıpla hazırlanır.
  fireEvent.press(screen.getByText("Günlük rutinim"));
  await waitFor(() => expect(mockStartSet).toHaveBeenCalled());
  expect(mockStartSet.mock.calls[0][0].focus.map((p: Pattern) => p.id)).toEqual(["sevmek"]);
  await pressAlert(/Vazgeç/);
  await press("Merdivene dön");
  await waitFor(() => expect(screen.getByText(/SIRADAKİ KALIP · A1/)).toBeTruthy());
  expect((await loadBuildUi()).focusOverride).toBeUndefined();
});

test("Sına ve geç: 4 tek seferlik cümleden 3'ü doğru → verify, merdiven atlar", async () => {
  render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/SIRADAKİ KALIP/)).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Kalıp merdiveni"));
  await press("A2");
  fireEvent.press(screen.getByLabelText("Kalıp: …-meyi seviyorum"));
  await press("Sına ve geç");
  await pressAlert(/Evet/);
  await waitFor(() => expect(mockProbe).toHaveBeenCalled());
  expect(mockProbe.mock.calls[0][2].perPattern).toBe(4);
  for (let i = 0; i < 4; i += 1) {
    await waitFor(() => expect(screen.getByText(`Çay içerim (sevmek ${i + 1})`)).toBeTruthy());
    await say(i === 2 ? "I drink coffee" : PROBE_T);
    await press(i < 3 ? "Sıradaki" : "Bitir");
  }
  await press("Bitti");
  await waitFor(() => expect(alerts.some((a) => a.title === "Geçtin")).toBe(true));
  const p = (await loadBuildProgress2()).sevmek;
  expect(p.status).toBe("verify");
  expect(p.masteredBy).toBe("test");
  expect(p.proof.filter((e) => e.k === "probe")).toHaveLength(4);
});

test("doğrulanacak kalıp: 'Doğrula' kayıtlı cümlesini tek seferde sorar, doğruysa oturur", async () => {
  const map: ProgressMap2 = { olmak: prog("verify", PAST, { masteredBy: "legacy" }) };
  await saveBuildProgress2(map);
  await dueMemory("olmak", FUTURE);
  render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("TEKRAR DOĞRULA · A1")).toBeTruthy());
  await press("Doğrula (tek seferde)");
  // Kayıtlı tek cümle yetmez (kalıp başına 2): yoklama onayla tamamlar.
  await pressAlert(/Evet/);
  await waitFor(() => expect(screen.getByText("Sabahları erken uyanmayı seviyorum.")).toBeTruthy());
  await say(S0[3]);
  await press("Sıradaki");
  await say(PROBE_T);
  await press("Sıradaki");
  await say(PROBE_T);
  await press("Bitir");
  await press("Bitti");
  expect(mockProbe.mock.calls[0][1].map((x: Pattern) => x.id)).toEqual(["olmak"]);
  await waitFor(async () => expect((await loadBuildProgress2()).olmak.status).toBe("mastered"));
  expect((await loadBuildProgress2()).olmak.masteredBy).toBe("legacy");
});

test("yerleştirme: A2 öğrencisine önerilir; geçilenler verify, ilk kalan kalıp odak olur", async () => {
  render(<SentenceBuildScreen profile={profileAt("A2")} onBack={() => {}} />);
  await press("Yerleştirmeyi başlat");
  await pressAlert(/Evet/);
  await waitFor(() => expect(mockProbe).toHaveBeenCalled());
  const asked: Pattern[] = mockProbe.mock.calls[0][1];
  expect(asked.length).toBe(8);
  expect(asked.every((p) => p.probe)).toBe(true);
  const items = asked.flatMap((p) => [p.id, p.id]);
  for (let i = 0; i < items.length; i += 1) {
    await waitFor(() => expect(screen.getByText(new RegExp(`\\(${items[i]} ${(i % 2) + 1}\\)`))).toBeTruthy());
    await say(items[i] === "vasita" ? "I go with bus" : PROBE_T);
    await press(i + 1 < items.length ? "Sıradaki" : "Bitir");
  }
  await press("Bitti");
  await waitFor(() => expect(alerts.some((a) => a.title === "Yerleştirme bitti")).toBe(true));
  // Kalan kalıp partiyi durdurur: ikinci istek gitmez.
  expect(mockProbe).toHaveBeenCalledTimes(1);
  const p = await loadBuildProgress2();
  expect(p["genis-zaman"].status).toBe("verify");
  expect(p.olmak.status).toBe("verify");
  expect(p.vasita.status).not.toBe("verify");
  expect((await loadBuildUi()).placementDone).toBe(true);
  await waitFor(() => expect(screen.getByText("…-la (araçla / biriyle)")).toBeTruthy());
  expect(screen.queryByText("Yerleştirmeyi başlat")).toBeNull();
});

test("A1 öğrencisine yerleştirme önerilmez; 'Baştan başlayacağım' teklifi kapatır", async () => {
  const { unmount } = render(<SentenceBuildScreen profile={profileAt("A1")} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/SIRADAKİ KALIP/)).toBeTruthy());
  expect(screen.queryByText("Yerleştirmeyi başlat")).toBeNull();
  unmount();
  render(<SentenceBuildScreen profile={profileAt("B1")} onBack={() => {}} />);
  await press("Baştan başlayacağım");
  await waitFor(() => expect(screen.queryByText("Yerleştirmeyi başlat")).toBeNull());
  expect((await loadBuildUi()).placementDone).toBe(true);
});

test("merdiven bitince karma: farklı seviyelerden oturmuş kalıplar tek sette", async () => {
  const map: ProgressMap2 = {};
  for (const p of PATTERN_LADDER) map[p.id] = prog("mastered", FUTURE);
  await saveBuildProgress2(map);
  render(<SentenceBuildScreen profile={profileAt("C2")} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("MERDİVEN BİTTİ · KARMA")).toBeTruthy());
  fireEvent.press(screen.getAllByText(/Günlük rutinim|İşte bir kriz|Haberlerde/)[0]);
  await waitFor(() => expect(mockStartSet).toHaveBeenCalled());
  const focus: Pattern[] = mockStartSet.mock.calls[0][0].focus;
  expect(focus.length).toBeGreaterThanOrEqual(2);
  expect(new Set(focus.map((p) => p.band)).size).toBe(focus.length);
  expect(mockStartSet.mock.calls[0][0].patternStatus).toBe("mastered");
});
