/**
 * Cümle Kurma ekranı — kart sırası (tasarım §3, §9 ekran listesi).
 *
 * Set, videonun sekiz cümlesinin GERÇEK cihaz toparlamasından geçmiş
 * hâlidir (uitests/fixtures/videoSet.ts); üretim hattı ve "Başka örnek"
 * isteği taklit edilir. Ölçülen dikişler:
 * - açıklamalar cevaptan SONRA (bağlaç kartı ve Türkçe lamba hariç),
 * - soru → Türkçe cevap → (sen söyle) sırası ve hocanın sözlü işaretleri,
 * - yalnız ilk deneme sayılır; yanlıştan/"Bilmiyorum"dan sonrası kopya,
 * - yanlış duyulan deneme silinebilir, boş cevap hiçbir şeyi değiştirmez,
 * - tek seferde → hocanın kuruşu; olmazsa adımlar,
 * - bekleyen cümlede "hazırlanıyor" ve kendiliğinden devam.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";
import SentenceBuildScreen from "../src/screens/SentenceBuildScreen";
import { DEFAULT_BUILD_UI } from "../src/buildmastery";
import type { BlockProgress, BuildUi, ProgressMap2 } from "../src/buildmastery";
import { setActiveLanguage } from "../src/languages";
import { normalizeSentence, validatePlan } from "../src/sentencebuilding";
import type { BuildSet } from "../src/sentencebuilding";
import { loadBuildProgress2, loadBuildSets2, loadBuildUi, saveBuildBlocks, saveBuildSets2, saveBuildUi } from "../src/storage";
import type { Profile } from "../src/types";
import { readySentence, videoSet } from "./fixtures/videoSet";

interface StartInput {
  focus: { id: string }[];
  theme: { id: string };
  confirm?: (note: string, n: number) => Promise<boolean> | boolean;
  hooks?: { onUpdate?: (s: BuildSet) => void };
}

const mockStartSet = jest.fn();
const mockContinue = jest.fn();
jest.mock("../src/buildpipeline", () => ({
  startSet: (...a: unknown[]) => mockStartSet(...a),
  continueSet: (...a: unknown[]) => mockContinue(...a),
  resumePending: async () => null,
  isGenerating: () => false,
}));
const mockMore = jest.fn();
jest.mock("../src/claude", () => ({
  generateMoreTransfer: (...a: unknown[]) => mockMore(...a),
}));

declare const global: { __dictation: { opts: { onResult: (t: string, a: string[]) => void } | null } };

const profile = {
  name: "Mehmet",
  apiKey: "sk-ant-x",
  completedModuleIds: [],
  assessment: { speakingLevel: "A1", readingLevel: "A1", strengths: [], weaknesses: [], summary: "" },
} as unknown as Profile;

type Btn = { text?: string; onPress?: () => void };
const alerts: { title?: string; buttons?: Btn[] }[] = [];
/** Sıradaki startSet çağrısının döndüreceği set (verilmezse videonun tamamı). */
let nextSet: BuildSet | null = null;
let lastHooks: StartInput["hooks"];

beforeEach(async () => {
  alerts.length = 0;
  nextSet = null;
  lastHooks = undefined;
  mockStartSet.mockReset();
  mockContinue.mockReset();
  mockMore.mockReset();
  mockContinue.mockImplementation(async () => ({ set: null }));
  mockStartSet.mockImplementation(async (input: StartInput) => {
    if (input.confirm && !(await input.confirm("1 plan + 8 cümle", 8))) return null;
    const s = nextSet ?? videoSet({ patternId: input.focus[0].id, themeId: input.theme.id });
    await saveBuildSets2([s, ...(await loadBuildSets2())]);
    lastHooks = input.hooks;
    input.hooks?.onUpdate?.(s);
    return s;
  });
  setActiveLanguage("en");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  // Hızlı akış testlerin çoğunda kapalı: zamanlayıcı kartı kendiliğinden geçirmesin.
  await saveBuildUi({ ...DEFAULT_BUILD_UI, fastFlow: false });
  require("expo-speech").speak.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation((title?: string, _b?: string, buttons?: Btn[]) => {
    alerts.push({ title, buttons });
  });
});

async function pressAlert(re: RegExp) {
  const b = alerts[alerts.length - 1].buttons!.find((x) => re.test(x.text ?? ""))!;
  await act(async () => {
    b.onPress?.();
  });
}

/** Ana ekran → tema → bütçe onayı → set girişi → "Başlayalım" → okuma kartı. */
async function start(set?: BuildSet) {
  if (set) nextSet = set;
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("Günlük rutinim")).toBeTruthy());
  fireEvent.press(screen.getByText("Günlük rutinim"));
  await waitFor(() => expect(alerts.length).toBeGreaterThan(0));
  await pressAlert(/Evet/);
  await waitFor(() => expect(screen.getByText("Başlayalım")).toBeTruthy());
  fireEvent.press(screen.getByText("Başlayalım"));
  await waitFor(() => expect(screen.getByText("Kurmaya başla")).toBeTruthy());
}

/** Öğrenci mikrofona söyledi (n-best: ilk eleman en olası duyuş). */
async function say(text: string, alts: string[] = [text]) {
  await act(async () => {
    global.__dictation.opts!.onResult(text, alts);
  });
}

async function next(label: RegExp = /^Devam$/) {
  await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  fireEvent.press(screen.getByText(label));
}

async function progress(): Promise<ProgressMap2> {
  return loadBuildProgress2();
}

/** Birinci cümlenin (açılış) dört adımı. */
const S0 = ["I like", "I like to wake up", "I like to wake up early", "I like to wake up early in the morning."];

// ---------------------------------------------------------------------------

test("ekranı açmak istek harcamaz; yeni set tek bütçe onayı ister", async () => {
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/SIRADAKİ KALIP/)).toBeTruthy());
  expect(mockStartSet).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText("Günlük rutinim"));
  await waitFor(() => expect(alerts[0]?.title).toMatch(/Yeni set/));
  await pressAlert(/Vazgeç/);
  await waitFor(() => expect(screen.getByText(/SIRADAKİ KALIP/)).toBeTruthy());
});

test("bağlaçsız cümle: okuma kartından doğrudan 1. adıma; cevaptan önce hedef ya da 'Ayrıca' yok", async () => {
  await start();
  expect(screen.getByText("Sabahları erken uyanmayı seviyorum.")).toBeTruthy();
  expect(screen.queryByText(/I like/)).toBeNull();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  // Bağlaç kartı yok: hemen adım — soru ve Türkçe cevap satırı.
  await waitFor(() => expect(screen.getByText("Kim seviyor?")).toBeTruthy());
  expect(screen.getByText("Yüklemden başlıyoruz")).toBeTruthy();
  expect(screen.getByText("→ Seviyorum")).toBeTruthy();
  expect(screen.queryByText(/I like/)).toBeNull();
  expect(screen.queryByText(/Ayrıca/)).toBeNull();
  expect(screen.queryByText(/Burada bir bağlacımız var/)).toBeNull();
});

test("Türkçe cevap satırı ve lamba denemeden ÖNCE; lamba yalnız Türkçe tetik", async () => {
  await start();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await say(S0[0]);
  await next();
  // 2. adım: "-mayı" ekinin yapısı (to wake up) HENÜZ gösterilmez.
  await waitFor(() => expect(screen.getByText("Neyi seviyorum?")).toBeTruthy());
  expect(screen.getByText("→ Uyanmayı seviyorum")).toBeTruthy();
  expect(screen.getByText(/uyanmayı: ekine dikkat/)).toBeTruthy();
  expect(screen.queryByText(/wake up/)).toBeNull();
  expect(screen.getByText("Şu ana kadar")).toBeTruthy();
  expect(screen.getByText("I like")).toBeTruthy(); // "…" yok
  await say(S0[1]);
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  // Cevaptan sonra: adımın notu, taşın notu ve alternatifi.
  expect(screen.getByText(/-mayı ekini to ile veririz/)).toBeTruthy();
  expect(screen.getByText(/Ayrıca: waking up/)).toBeTruthy();
});

test("eklenen kelimeler vurgulanır; doğrusu SESLİ okunur", async () => {
  await start();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await say(S0[0]);
  await next();
  await say(S0[1]);
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  const added = screen.getAllByTestId("added-word").map((n) => String((n.props as { children: unknown[] }).children[0]));
  expect(added).toEqual(["to", "wake", "up"]);
  expect(require("expo-speech").speak).toHaveBeenCalledWith("I like to wake up", expect.anything());
});

test("taşın karşıtlığı o adımın cevabından SONRA gelir; son adım 'toparlayalım'", async () => {
  await start();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  for (const t of S0.slice(0, 3)) {
    await say(t);
    await next();
  }
  await waitFor(() => expect(screen.getByText("Ne zaman?")).toBeTruthy());
  expect(screen.getByText("Şimdi cümlemizi toparlayalım")).toBeTruthy();
  expect(screen.queryByText(/on the morning değil/)).toBeNull();
  await say(S0[3]);
  await waitFor(() => expect(screen.getByText(/on the morning değil/)).toBeTruthy());
});

test("boş cevap: ne karar, ne puan, ne ilerleme", async () => {
  await start();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText("Kim seviyor?")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Klavyeyle yaz"));
  const input = screen.getByPlaceholderText(/tamamını yaz/);
  fireEvent.changeText(input, "   ");
  fireEvent(input, "submitEditing");
  fireEvent.changeText(input, " ... ");
  fireEvent.press(screen.getByText("Kontrol et"));
  await act(async () => {});
  expect(screen.queryByText("Doğru")).toBeNull();
  expect(screen.queryByText(/Olmadı/)).toBeNull();
  expect(screen.getByText("Kim seviyor?")).toBeTruthy();
  expect(await progress()).toEqual({});
});

test("Bilmiyorum → tekrar: kopya sayılır, ilk deneme yüzdesi tekrarları saymaz", async () => {
  await start(videoSet({ only: [0] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText("Bilmiyorum")).toBeTruthy());
  fireEvent.press(screen.getByText("Bilmiyorum"));
  await waitFor(() => expect(screen.getByText("Doğrusu:")).toBeTruthy());
  expect(screen.getByText("I like")).toBeTruthy();
  fireEvent.press(screen.getByText("Bir daha söyle"));
  await say(S0[0]); // doğru ama gördükten sonra: kopya
  await next();
  for (const t of S0.slice(1)) {
    await say(t);
    await next();
  }
  // Eş kartı (isteğe bağlı) geçilir, özet, set sonu.
  await next(/^Geç$/);
  await next(/Seti bitir/);
  await waitFor(() => expect(screen.getByText(/Adımların %75'i ilk seferde doğru/)).toBeTruthy());
  const p = (await progress()).olmak;
  expect(p.learn.attempts).toBe(4); // kopya sayılmadı
  expect(p.learn.firstTryOk).toBe(3);
});

test("'Ses tanıma yanlış duydu, sayma': deneme iz bırakmaz, sonraki deneme ilk sayılır", async () => {
  await start();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await say("I lake");
  await waitFor(() => expect(screen.getByText(/Olmadı/)).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Ses tanıma yanlış duydu, sayma"));
  await waitFor(() => expect(screen.queryByText(/Olmadı/)).toBeNull());
  await say(S0[0]);
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await next();
  await waitFor(async () => {
    const p = (await progress()).olmak;
    expect(p.learn.attempts).toBe(1);
    expect(p.learn.firstTryOk).toBe(1);
  });
});

test("'sayma' bir kopyayı silerse sonraki cevap yine kopyadır (ilk deneme hakkı geri gelmez)", async () => {
  await start(videoSet({ only: [0] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await say("I lake");
  await waitFor(() => expect(screen.getByText(/Olmadı/)).toBeTruthy());
  fireEvent.press(screen.getByText("Bir daha söyle")); // ilk deneme kayıp olarak yazıldı
  await say("I lake"); // kopya
  await waitFor(() => expect(screen.getByLabelText("Ses tanıma yanlış duydu, sayma")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Ses tanıma yanlış duydu, sayma"));
  await say(S0[0]);
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await next();
  await waitFor(async () => {
    const p = (await progress()).olmak;
    expect(p.learn.attempts).toBe(1);
    expect(p.learn.firstTryOk).toBe(0);
  });
});

test("n-best: yutulan artikeli öteki duyuş kurtarır, 'Duyduğum' seçilen duyuşu gösterir", async () => {
  await start(videoSet({ only: [1] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await next();
  for (const t of ["Before", "Before I have breakfast", "Before I have breakfast, I take a shower."]) {
    await say(t);
    await next();
  }
  await waitFor(() => expect(screen.getByText("Bağlacı ortaya al: ana cümleyle başla.")).toBeTruthy());
  await say("I take shower before I have breakfast", ["I take shower before I have breakfast", "I take a shower before I have breakfast"]);
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  expect(screen.getByText("Duyduğum: I take a shower before I have breakfast")).toBeTruthy();
});

test("n-best: bu adımda eklenen kelimeyi öteki duyuş kurtarmaz", async () => {
  await start();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  for (const t of S0.slice(0, 3)) {
    await say(t);
    await next();
  }
  await say("I like to wake up early in morning", ["I like to wake up early in morning", "I like to wake up early in the morning"]);
  await waitFor(() => expect(screen.getByText(/Olmadı/)).toBeTruthy());
});

test("bağlaç kartı: iki kısım ve karşıtlık (ilk sefer); sonraki bağlaçta öğrenci kendisi böler", async () => {
  await start(videoSet({ only: [1] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText(/Burada bir bağlacımız var/)).toBeTruthy());
  expect(screen.getByText("kahvaltı yapmak")).toBeTruthy();
  expect(screen.getByText("duş almak")).toBeTruthy();
  expect(screen.getByText(/ago değil/)).toBeTruthy();
  expect(screen.getAllByText("Bağlaçla başlıyorum").length).toBeGreaterThan(0);
  await next();
  await waitFor(async () => expect((await loadBuildUi()).connSeen.before).toBe(1));
  screen.unmount();

  // Karşıtlığı görülmüş bağlaç + 3. bağlaçlı cümle: kart önce öğrenciye böldürür.
  const seen: BuildUi = { ...DEFAULT_BUILD_UI, fastFlow: false, connSeen: { before: 1, after: 1 } };
  await saveBuildUi(seen);
  await saveBuildSets2([]);
  alerts.length = 0;
  await start(videoSet({ only: [1], stores: { connSeen: { before: 1, after: 1 } }, id: "b" }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText("Bağlacı sen bul")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Kelime: yapmadan"));
  await waitFor(() => expect(screen.getByLabelText("Seçenek: ago")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Seçenek: ago"));
  await waitFor(() => expect(screen.getByText(/Olmadı: ago değil/)).toBeTruthy());
  expect(screen.queryByText(/ago değil: ago sadece/)).toBeNull(); // karşıtlık bir kez
  expect(screen.getByText("kahvaltı yapmak")).toBeTruthy();
  await next();
  await waitFor(async () => expect((await progress()).olmak.retrieval).toEqual([0]));
});

test("bağlaç kartı: ek uyumu değişse de öğrenci böler; bağlaç bulunamazsa kart kilitlenmez", async () => {
  const stores = { connSeen: { before: 1, after: 1 } };
  await saveBuildUi({ ...DEFAULT_BUILD_UI, fastFlow: false, connSeen: { before: 1, after: 1 } });
  // Yöntem tablosunun anahtarı "-madan önce"; cümlede "gitmeden önce" geçer.
  const harmony = videoSet({ only: [1], stores, id: "h" });
  harmony.sentences[0] = { ...harmony.sentences[0], tr: "İşe gitmeden önce duş alırım." };
  await start(harmony);
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText("Bağlacı sen bul")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Kelime: gitmeden"));
  await waitFor(() => expect(screen.getByLabelText("Seçenek: before")).toBeTruthy());
  screen.unmount();

  // Türkçede bağlaç hiç bulunamıyor: bölme adımı yok, "Devam" da açık.
  await saveBuildSets2([]);
  alerts.length = 0;
  const lost = videoSet({ only: [1], stores, id: "l" });
  lost.sentences[0] = { ...lost.sentences[0], tr: "Kahvaltı sonrası duş alırım." };
  await start(lost);
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText(/Burada bir bağlacımız var/)).toBeTruthy());
  expect(screen.queryByText("Bağlacı sen bul")).toBeNull();
  await next();
  await waitFor(() => expect(screen.getByText("Bağlaçla başlıyorum")).toBeTruthy());
  expect(screen.queryByText(/Burada bir bağlacımız var/)).toBeNull();
});

test("yan cümle: 'Birinci kısmımız oldu', toparla açıklaması, sıralama 'have a shower'ı kabul eder", async () => {
  await start(videoSet({ only: [1] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await next();
  await waitFor(() => expect(screen.getByText("Bağlaçla başlıyorum")).toBeTruthy());
  await say("Before");
  await next();
  await say("Before I have breakfast");
  await waitFor(() => expect(screen.getByText(/Birinci kısmımız oldu → Before I have breakfast/)).toBeTruthy());
  await next();
  await say("Before I have breakfast, I have a shower.");
  await waitFor(() => expect(screen.getByText(/Doğru, bu da olur/)).toBeTruthy());
  expect(screen.getByText("duş alırım.")).toBeTruthy(); // ikinci kısmın Türkçesi
  await next();
  await waitFor(() => expect(screen.getByText("Bağlacı ortaya al: ana cümleyle başla.")).toBeTruthy());
  await say("I have a shower before I have breakfast.");
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await next();
  await waitFor(() => expect(screen.getByText("CÜMLE KURULDU")).toBeTruthy());
  // Özet öğrencinin söyleyişiyle.
  expect(screen.getByText("Before I have breakfast, I have a shower.")).toBeTruthy();
});

test("çünkü: bağlantılı adım 'Önceki cümleyi söyle', sıralama kartı yok", async () => {
  await start(videoSet({ only: [6] }));
  expect(screen.getByText("Bir önceki cümlemizle bağlantılı")).toBeTruthy();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText(/Önceki cümleyi söyleyip çünkü ile/)).toBeTruthy());
  await next();
  await waitFor(() => expect(screen.getByText("Önceki cümleyi söyle")).toBeTruthy());
  expect(screen.queryByText("Şu ana kadar")).toBeNull();
  const steps = [
    "When I arrive at home, I turn on the TV.",
    "When I arrive at home, I turn on the TV because",
    "When I arrive at home, I turn on the TV because I like",
    "When I arrive at home, I turn on the TV because I like watching",
    "When I arrive at home, I turn on the TV because I like watching news.",
  ];
  for (const t of steps) {
    await say(t);
    await next();
  }
  await waitFor(() => expect(screen.getByText("CÜMLE KURULDU")).toBeTruthy());
  expect(screen.queryByText(/Bağlacın yeri değişir/)).toBeNull();
});

test("son cümle tek seferde: doğruysa hocanın kuruşu → özet", async () => {
  await start(videoSet({ only: [7] }));
  expect(screen.getByText("Ve geldik son cümlemize")).toBeTruthy();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await next(); // öğrendik çipleri
  await waitFor(() => expect(screen.getByText("Önce kendin dene")).toBeTruthy());
  await say("I go to bed at around 10 PM.");
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await next();
  await waitFor(() => expect(screen.getByText("Hocanın kuruşu")).toBeTruthy());
  await next();
  await waitFor(() => expect(screen.getByText("CÜMLE KURULDU")).toBeTruthy());
  const p = (await progress()).olmak;
  expect(p.proof.map((e) => e.k)).toEqual(["oneshot"]);
  expect(p.proofKeys).toHaveLength(1);
});

test("son cümle tek seferde olmazsa adımlar açılır; geri çağırmada yanlış seçim kayıp yazılır", async () => {
  await start(videoSet({ only: [7] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await next();
  await say("I go to the bed");
  await waitFor(() => expect(screen.getByText("Olmadı — adım adım kuralım")).toBeTruthy());
  expect(screen.queryByText(/10 PM/)).toBeNull(); // doğrusu gösterilmez
  await next(/Adım adım kur/);
  await waitFor(() => expect(screen.getByText("Kim gider?")).toBeTruthy());
  expect(screen.queryByText("Hocanın kuruşu")).toBeNull();
  await say("I go to bed");
  await next();
  await waitFor(() => expect(screen.getByText("AM mi PM mi?")).toBeTruthy());
  // Seçeneklere uymayan duyuş sessizce yutulmaz.
  await say("banana");
  await waitFor(() => expect(screen.getByText(/Duyduğum: banana/)).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Seçenek: AM"));
  await waitFor(() => expect(screen.getByText(/PM: işten çıktığımız/)).toBeTruthy());
  await next();
  await waitFor(async () => expect((await progress()).olmak.retrieval).toEqual([0]));
});

test("öğrendik çipleri yalnız Türkçe; 'Nasıldı?' söylenince denetlenir", async () => {
  const b: BlockProgress = {
    target: "at around 7 PM", tr: "saat 7 gibi", kind: "rule", note: "", contrast: "", firstPatternId: "olmak",
    firstSetId: "eski", firstSentence: 4, contrastShown: true, producedOk: 1, recycledOkKeys: [], sets: ["eski"],
    trapMiss: 0, retrievalOk: 0, retrievalMiss: 0, lastSeen: "2026-09-01T00:00:00.000Z",
  };
  await saveBuildBlocks({ "at around 7 pm": b });
  await start(videoSet({ only: [7] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText("Bunu öğrendik")).toBeTruthy());
  expect(screen.getByText(/saat 7 gibi · Öğrendik/)).toBeTruthy();
  expect(screen.getByText(/rahatlıkla çevirebiliriz/)).toBeTruthy();
  expect(screen.queryByText(/7 PM/)).toBeNull();
  fireEvent.press(screen.getByText(/saat 7 gibi · Öğrendik/));
  await waitFor(() => expect(screen.getByText(/Nasıldı\?/)).toBeTruthy());
  await say("at around 7 PM");
  await waitFor(() => expect(screen.getByText("Doğru hatırladın")).toBeTruthy());
  expect(screen.getByText("at around 7 PM")).toBeTruthy();
});

test("hızlı akış: okunacak yeni bir şey yoksa doğru cevaptan sonra kendiliğinden geçer", async () => {
  await saveBuildUi({ ...DEFAULT_BUILD_UI, fastFlow: true });
  await start();
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await say(S0[0]);
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  const speak = require("expo-speech").speak as jest.Mock;
  const opts = speak.mock.calls[speak.mock.calls.length - 1][1] as { onDone: () => void };
  await act(async () => {
    opts.onDone();
  });
  await waitFor(() => expect(screen.getByText("Neyi seviyorum?")).toBeTruthy());
});

test("günümü anlat: her cümle tek seferde, yardımsız kanıt olarak yazılır", async () => {
  await start(videoSet({ only: [0, 1] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  for (const t of S0) {
    await say(t);
    await next();
  }
  await next(/^Geç$/);
  await next(/Sıradaki cümle/);
  await next(/Kurmaya başla/);
  await next(); // bağlaç
  for (const t of ["Before", "Before I have breakfast", "Before I have breakfast, I take a shower."]) {
    await say(t);
    await next();
  }
  await say("I take a shower before I have breakfast.");
  await next();
  await next(/Seti bitir/);
  await waitFor(() => expect(screen.getByText("Tek tek anlat")).toBeTruthy());
  fireEvent.press(screen.getByText("Tek tek anlat"));
  await say(S0[3]);
  await next(/Sıradaki/);
  await say("Before I have breakfast, I take a shower.");
  await next(/Bitir/);
  await waitFor(() => expect(screen.getByText(/cümle kurdun/)).toBeTruthy());
  const p = (await progress()).olmak;
  // İkinci cümle sıralamada zaten yardımsız kanıtlanmıştı: aynı cümleyi yeniden
  // söylemek farklı cümle sayılmaz, kanıt listesine ikinci kez girmez (CM-9).
  expect(p.proof.filter((e) => e.k === "retell")).toHaveLength(1);
  expect([...p.proofKeys].sort()).toEqual(["before i have breakfast i take a shower", "i like to wake up early in the morning"]);
  // Anlatım bitince 1 gün sonra "Tekrar zamanı"nda yeniden gelir.
  expect(Object.keys((await loadBuildUi()).retells ?? {})).toHaveLength(1);
});

test("eş cümle cihazda kurulur ve aktarım sayılır; 'Kendi cümlen' yalnız pratik; 'Başka örnek' yeni cümle getirir", async () => {
  mockMore.mockResolvedValue([{ target: "I get up early", tr: "Erken kalkarım" }]);
  await start(videoSet({ only: [0] }));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  for (const t of S0) {
    await say(t);
    await next();
  }
  await waitFor(() => expect(screen.getByText("Tersiyle söyle")).toBeTruthy());
  expect(screen.getByText("Sabahları geç uyanmayı seviyorum.")).toBeTruthy();
  // Açık uç: kalıp geçiyor ama hiçbir şey yazılmaz.
  fireEvent.press(screen.getByText("Kendi cümlen"));
  await say("I wake up early on Sundays");
  await waitFor(() => expect(screen.getByText("Güzel — parçayı kullandın")).toBeTruthy());
  expect((await progress()).olmak?.transferOk ?? 0).toBe(0);
  // Başka örnek: bir istek (onaylı), gelen cümle aktarım olarak söyletilir.
  fireEvent.press(screen.getByText("Başka örnek"));
  await pressAlert(/Evet/);
  await waitFor(() => expect(screen.getByText("Erken kalkarım")).toBeTruthy());
  expect(mockMore).toHaveBeenCalledTimes(1);
  await say("I get up early");
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await next();
  await waitFor(async () => expect((await progress()).olmak.transferOk).toBe(1));
});

test("bekleyen cümle: 'hazırlanıyor' kartı, cümle gelince kendiliğinden devam", async () => {
  const s = videoSet({ pendingFrom: 1 });
  await start(s);
  fireEvent.press(screen.getByText("Kurmaya başla"));
  for (const t of S0) {
    await say(t);
    await next();
  }
  await next(/^Geç$/);
  await next(/Sıradaki cümle/);
  await waitFor(() => expect(screen.getByText("Hoca sıradaki cümleyi hazırlıyor…")).toBeTruthy());
  expect(mockContinue).toHaveBeenCalled();
  const ready = { ...s, sentences: s.sentences.map((x, k) => (k === 1 ? readySentence(s, 1) : x)) };
  await act(async () => {
    lastHooks?.onUpdate?.(ready);
  });
  await waitFor(() => expect(screen.getByText("Kahvaltı yapmadan önce duş alırım.")).toBeTruthy());
  expect(screen.getByText("Kurmaya başla")).toBeTruthy();
});

test("set SAKLANIR ve ikinci açılışta BEDAVA gelir", async () => {
  await start();
  expect(mockStartSet).toHaveBeenCalledTimes(1);
  screen.unmount();
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("hazır")).toBeTruthy());
  fireEvent.press(screen.getByText("Günlük rutinim"));
  await waitFor(() => expect(screen.getByText("Başlayalım")).toBeTruthy());
  expect(mockStartSet).toHaveBeenCalledTimes(1);
});

test("kayıtlı setler: Devam (Bölüm n+1), Tek seferde tekrar, Pratik", async () => {
  await saveBuildSets2([videoSet()]);
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("Devam (Bölüm 2)")).toBeTruthy());
  expect(screen.getByText("Tek seferde tekrar")).toBeTruthy();
  fireEvent.press(screen.getByText("Tek seferde tekrar"));
  await waitFor(() => expect(screen.getByText("tek seferde")).toBeTruthy()); // mod rozeti
  fireEvent.press(screen.getByText("Başlayalım"));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText("Tekrar: tek seferde")).toBeTruthy());
});

test("üretim hatası ekranı kilitlemez", async () => {
  mockStartSet.mockImplementationOnce(async (input: StartInput) => {
    await input.confirm?.("", 8);
    throw new Error("Plan hazırlanamadı");
  });
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("Günlük rutinim")).toBeTruthy());
  fireEvent.press(screen.getByText("Günlük rutinim"));
  await waitFor(() => expect(alerts.length).toBe(1));
  await pressAlert(/Evet/);
  await waitFor(() => expect(alerts.some((a) => /hazırlanamadı/.test(a.title ?? ""))).toBe(true));
  expect(screen.getByText("Günlük rutinim")).toBeTruthy();
});

/** Arapça tek cümle: "O işe gider." — erkek hâli kalıpta, kadın hâli swap. */
function arabicSet(): BuildSet {
  const plan = validatePlan(
    { intro: "Ailem", s: [{ tr: "O işe gider.", r: "open", new: ["إِلَى العَمَلِ"], focus: true, fn: true }, { tr: "b" }, { tr: "c" }, { tr: "d" }, { tr: "e" }, { tr: "f" }] },
    6,
    { lang: "ar", band: "A2" }
  ).plan;
  const s0 = normalizeSentence(
    {
      steps: [
        { q: "Kim gider?", p: "gider", t: "يَذْهَبُ", n: "يَـ = o (erkek)" },
        { q: "Nereye gider?", p: "işe", t: "يَذْهَبُ إِلَى العَمَلِ" },
      ],
      blocks: [{ t: "إِلَى العَمَلِ", tr: "işe", k: "caseSplit", s: 1 }],
      sw: [["يَذْهَبُ", "تَذْهَبُ", "dişil"]],
      tw: ["yadhhabu", "ilā", "l-ʿamal"],
    },
    plan,
    0,
    [],
    "ar",
    { band: "A2" }
  );
  return {
    v: 2, id: "ar-set", patternId: "olmak", themeId: "aile", lang: "ar", level: "A2", tense: "habit", episode: 1,
    intro: "Ailem", plan: { ...plan, sentences: [plan.sentences[0]] }, sentences: [s0], createdAt: "2026-09-29T00:00:00.000Z",
  };
}

test("Arapça: 'erkek mi kadın mı' seçimi gösterilen biçimi değiştirir, ikisi de kabul; hareke anahtarı", async () => {
  setActiveLanguage("ar");
  await saveBuildUi({ ...DEFAULT_BUILD_UI, fastFlow: false });
  nextSet = arabicSet();
  render(<SentenceBuildScreen profile={profile} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText("Ailem")).toBeTruthy());
  fireEvent.press(screen.getByText("Ailem"));
  await waitFor(() => expect(alerts.length).toBeGreaterThan(0));
  await pressAlert(/Evet/);
  await waitFor(() => expect(screen.getByText("Başlayalım")).toBeTruthy());
  fireEvent.press(screen.getByText("Başlayalım"));
  fireEvent.press(screen.getByText("Kurmaya başla"));
  await waitFor(() => expect(screen.getByText("Kim gider?")).toBeTruthy());
  fireEvent.press(screen.getByText("Kadın"));
  // Kadın hâli harekesiz söylendi: kabul, gösterim kadın hâliyle.
  await say("تذهب");
  await waitFor(() => expect(screen.getByText("Doğru")).toBeTruthy());
  await next();
  await waitFor(() => expect(screen.getByText("Şu ana kadar")).toBeTruthy());
  expect(screen.getByText("تَذْهَبُ")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Harekeleri gizle"));
  await waitFor(() => expect(screen.getByText("تذهب")).toBeTruthy());
  await waitFor(async () => expect((await loadBuildUi()).showHarakat).toBe(false));
});
