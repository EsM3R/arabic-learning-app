/**
 * Konuşma Odası ekran testi.
 *
 * Kullanıcının şikâyeti: "mesajlaşma uygulaması gibi, konuşma havası yok."
 * Bu ekranın varlık sebebi o şikâyet; buradaki testler de tam olarak
 * "konuşma hissi"ni yapan üç dikişi tutuyor:
 *
 * 1. SES ÖNCE: ilk cümle, cevabın tamamı gelmeden okunmaya başlar. Bozulursa
 *    ekran çökmez, ses de gelir — yalnız cevabın sonunu bekler ve his ölür.
 * 2. SIRA KENDİ GEÇER: hoca susunca mikrofon kendi açılır, öğrenci susunca
 *    kendi kapanır. Eller serbest kip mikrofona doğru süreyi vermezse ekran
 *    yine "çalışır", ama düğmeli sohbete geri döner.
 * 3. DÜZELTME SONRA: sahne promptu düzeltmeyi yasaklar; değerlendirme ayrı
 *    bir çağrıyla gelir ve hata defterine yazılır.
 *
 * Bir de para dikişi: hiç konuşulmamış sahneye değerlendirme çağrısı yok.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import ConversationScreen from "../src/screens/ConversationScreen";
import { setActiveLanguage } from "../src/languages";
import { flushStats, loadStatsSummary } from "../src/statsStore";
import { loadMistakes, loadVocab } from "../src/storage";
import type { Profile } from "../src/types";

/** Ses modeli ağı: varsayılan reddeder; ses testleri sesli cevap verdirir. */
const mockVoiceFetch = jest.fn(async () => {
  throw new Error("ses ağı kapalı");
});
jest.mock("expo/fetch", () => ({ fetch: (...a: unknown[]) => mockVoiceFetch(...a) }));
const okAudio = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new Uint8Array(4).buffer,
  json: async () => ({}),
});

/** Model taklidi: metni parça parça akıtır, sonra tamamını döndürür. */
const mockChat = jest.fn();
const mockDebrief = jest.fn();
jest.mock("../src/claude", () => ({
  agenticChat: (...a: unknown[]) => mockChat(...a),
  generateDebrief: (...a: unknown[]) => mockDebrief(...a),
}));

type Hooks = { onText?: (d: string) => void };
type ChatOpts = { tools?: unknown[]; hooks?: Hooks };

/** Verilen cümleleri delta delta akıtan hoca. */
function teacherStreams(text: string, chunk = 4) {
  mockChat.mockImplementation(async (_s: unknown, _m: unknown, _c: unknown, opts: ChatOpts) => {
    for (let i = 0; i < text.length; i += chunk) {
      opts.hooks?.onText?.(text.slice(i, i + chunk));
    }
    return { text, actions: [] };
  });
}

function profile(level = "A2"): Profile {
  return {
    name: "Mehmet",
    apiKey: "sk-ant-x",
    completedModuleIds: [],
    assessment: {
      speakingLevel: level,
      readingLevel: level,
      strengths: [],
      weaknesses: [],
      summary: "",
    },
  } as unknown as Profile;
}

type Dict = {
  opts: { onResult: (t: string) => void; autoStopMs?: number };
  started: number;
  stopped: number;
};
const dict = () => (global as unknown as { __dictation: Dict }).__dictation;

function hear(text: string) {
  act(() => {
    dict().opts.onResult(text);
  });
}

function lastChatCall() {
  const c = mockChat.mock.calls[mockChat.mock.calls.length - 1];
  return { system: c[0] as string, messages: c[1] as { role: string; content: string }[], opts: c[3] as ChatOpts };
}

beforeEach(async () => {
  mockChat.mockReset();
  teacherStreams("Merhaba! Nasılsın?");
  mockDebrief.mockReset();
  mockDebrief.mockResolvedValue({
    summary: "İyi geçti.",
    goalReached: true,
    corrections: [{ said: "ana bidd kahwa", better: "أريد قهوة", why: "fusha'da 'bidd' yok" }],
    keep: ["Selamlaşmayı doğru yaptın"],
    phrases: [{ target: "الحساب من فضلك", translit: "el-hisâb min fadlik", tr: "hesap lütfen" }],
  });
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  const Speech = require("expo-speech");
  Speech.speak.mockReset();
  // Varsayılan: cümle ANINDA biter → kuyruk akar, hoca susunca sıra geçer.
  Speech.speak.mockImplementation((_t: string, o: { onDone?: () => void }) => o.onDone?.());
  dict().started = 0;
  dict().stopped = 0;
  mockVoiceFetch.mockReset();
  mockVoiceFetch.mockImplementation(async () => {
    throw new Error("ses ağı kapalı");
  });
});

async function openRoom(level = "A2") {
  render(<ConversationScreen profile={profile(level)} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/sesli sohbet/)).toBeTruthy());
}

async function startScene(title: RegExp) {
  fireEvent.press(screen.getByText(title));
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));
  await act(async () => {});
}

// --- sahne seçimi -------------------------------------------------------------

test("seçim ekranı: serbest sohbet + seviyeye uygun sahneler, metin kutusu YOK", async () => {
  await openRoom("A1");
  expect(screen.getByText(/Kafede sipariş/)).toBeTruthy();
  expect(screen.queryByText(/İş görüşmesi/)).toBeNull(); // A1'e sunulmaz
  expect(screen.queryByPlaceholderText(/yaz/i)).toBeNull(); // mesajlaşma değil
  expect(mockChat).not.toHaveBeenCalled(); // ekranı açmak para harcamaz
});

test("sahne başlayınca hoca KARAKTERDE ve DÜZELTMESİZ konuşur, araçsız", async () => {
  await openRoom();
  await startScene(/Kafede sipariş/);
  const { system, messages, opts } = lastChatCall();
  expect(system).toMatch(/ROL SAHNESİ/);
  expect(system).toMatch(/DÜZELTME YAPMA/);
  expect(system).toMatch(/KARAKTERDEN ÇIKMA/);
  expect(system).toMatch(/EN FAZLA 1-3 cümle/);
  expect(messages[0].content).toMatch(/Kafede sipariş/);
  expect(opts.tools).toEqual([]); // defter karıştırma yok: sesin ortasında boşluk olmasın
});

test("serbest sohbette hoca hocadır ama yine konuşma kurallarıyla", async () => {
  await openRoom("B1");
  await startScene(/ile sesli sohbet/);
  const { system } = lastChatCall();
  expect(system).toMatch(/SESLİ SOHBET/);
  expect(system).toMatch(/Türkçeye geçme/); // B1 dil politikası
  expect(system).not.toMatch(/ROL SAHNESİ/);
});

// --- ses önce -----------------------------------------------------------------

test("İLK CÜMLE, cevabın tamamı gelmeden okunmaya başlar", async () => {
  // Bu bozulursa ekran çökmez, ses de gelir — sadece cevabın sonunu bekler
  // ve konuşma hissi sessizce ölür.
  const Speech = require("expo-speech");
  let spokenBeforeResolve: string[] = [];
  mockChat.mockImplementation(async (_s: unknown, _m: unknown, _c: unknown, opts: ChatOpts) => {
    opts.hooks?.onText?.("Merhaba! Bugün ");
    spokenBeforeResolve = Speech.speak.mock.calls.map((c: unknown[]) => c[0] as string);
    opts.hooks?.onText?.("ne yaptın?");
    return { text: "Merhaba! Bugün ne yaptın?", actions: [] };
  });
  await openRoom();
  await startScene(/ile sesli sohbet/);
  expect(spokenBeforeResolve).toEqual(["Merhaba!"]); // cevap bitmeden ilk cümle sese gitti
  const all = Speech.speak.mock.calls.map((c: unknown[]) => c[0] as string);
  expect(all).toEqual(["Merhaba!", "Bugün ne yaptın?"]); // hiçbir cümle iki kez okunmadı
});

test("akış gelmeyen sağlayıcıda cevap yine cümle cümle okunur", async () => {
  mockChat.mockResolvedValue({ text: "Merhaba. Nasılsın?", actions: [] }); // hook hiç çağrılmıyor
  await openRoom();
  await startScene(/ile sesli sohbet/);
  const Speech = require("expo-speech");
  const all = Speech.speak.mock.calls.map((c: unknown[]) => c[0] as string);
  expect(all).toEqual(["Merhaba.", "Nasılsın?"]);
});

// --- sıra kendi geçer ----------------------------------------------------------

test("hoca susunca mikrofon KENDİ açılır — eller serbest, sessizlik süresiyle", async () => {
  await openRoom();
  await startScene(/ile sesli sohbet/);
  await waitFor(() => expect(dict().started).toBe(1));
  expect(dict().opts.autoStopMs).toBeGreaterThan(1500); // Android'in ~1 sn eşiğinden uzun
  expect(screen.getAllByText(/seni dinliyor/).length).toBeGreaterThan(0); // başlıkta ve sahnede
});

test("öğrenci konuşunca SESLİ işaretle yeni tur koşar ve konuşma sayılır", async () => {
  await openRoom();
  await startScene(/ile sesli sohbet/);
  await waitFor(() => expect(dict().started).toBe(1));

  hear("أنا بخير");
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(2));
  const { messages } = lastChatCall();
  expect(messages[messages.length - 1].content).toMatch(/^\[sesli\]/);
  await flushStats();
  const stats = await loadStatsSummary();
  expect(stats.total.spoken).toBe(1);
  expect(stats.total.conversationTurn).toBe(1);
  expect(stats.total.produced).toBe(1); // Arapça söyledi
});

test("boş duyulan sıra tur harcamaz, sıra öğrencide kalır", async () => {
  await openRoom();
  await startScene(/ile sesli sohbet/);
  await waitFor(() => expect(dict().started).toBe(1));
  hear("   ");
  await act(async () => {});
  expect(mockChat).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/🎙️ Konuş/)).toBeTruthy();
});

test("eller serbest KAPATILINCA mikrofon kendi açılmaz, düğme çıkar", async () => {
  await openRoom();
  await startScene(/ile sesli sohbet/);
  await waitFor(() => expect(dict().started).toBe(1));
  fireEvent.press(screen.getByText(/eller serbest/));
  hear("مرحبا"); // ikinci tur, artık düğmeli kipte
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText(/Basılı tut ve konuş/)).toBeTruthy());
  expect(dict().started).toBe(1); // kendi açılmadı
  expect(dict().opts.autoStopMs).toBeUndefined();
});

test("hocanın sözü KESİLEBİLİR — gerçek konuşmada da olur", async () => {
  const Speech = require("expo-speech");
  Speech.speak.mockImplementation(() => {}); // cümle hiç bitmiyor: hoca konuşuyor
  await openRoom();
  await startScene(/ile sesli sohbet/);
  await waitFor(() => expect(screen.getByText(/Sözünü kes/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Sözünü kes/));
  expect(Speech.stop).toHaveBeenCalled();
  await waitFor(() => expect(dict().started).toBe(1));
});

// --- değerlendirme ----------------------------------------------------------------

test("Bitir: değerlendirme ÇAĞRILIR, gösterilir, düzeltmeler hata defterine yazılır", async () => {
  await openRoom();
  await startScene(/Kafede sipariş/);
  await waitFor(() => expect(dict().started).toBe(1));
  hear("ana bidd kahwa");
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(2));

  fireEvent.press(screen.getByText(/Bitir ve değerlendir/));
  await waitFor(() => expect(mockDebrief).toHaveBeenCalledTimes(1));
  const [, scenario, turns] = mockDebrief.mock.calls[0] as [unknown, { id: string }, { role: string }[]];
  expect(scenario.id).toBe("kafe");
  expect(turns.some((t) => t.role === "user")).toBe(true);

  await waitFor(() => expect(screen.getByText(/Hedefe ulaştın/)).toBeTruthy());
  expect(screen.getByText(/✗ ana bidd kahwa/)).toBeTruthy();
  expect(screen.getByText(/✓ أريد قهوة/)).toBeTruthy();
  expect(screen.getByText(/Selamlaşmayı doğru yaptın/)).toBeTruthy();

  await waitFor(async () => {
    const m = await loadMistakes();
    expect(m).toHaveLength(1);
    expect(m[0].correction).toBe("أريد قهوة");
    expect(m[0].track).toBe("konusma");
  });
});

test("kalıplar tek dokunuşla deftere eklenir, mükerrer eklenmez", async () => {
  await openRoom();
  await startScene(/Kafede sipariş/);
  await waitFor(() => expect(dict().started).toBe(1));
  hear("مرحبا");
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(2));
  fireEvent.press(screen.getByText(/Bitir ve değerlendir/));
  await waitFor(() => expect(screen.getByText(/Kalıpları deftere ekle/)).toBeTruthy());

  fireEvent.press(screen.getByText(/Kalıpları deftere ekle/));
  await waitFor(async () => {
    const cards = await loadVocab();
    expect(cards).toHaveLength(1);
    expect(cards[0].arabic).toBe("الحساب من فضلك");
    expect(cards[0].track).toBe("konusma");
  });
  await waitFor(() => expect(screen.getByText(/✓ Defterde/)).toBeTruthy());
});

test("HİÇ konuşulmamış sahnede değerlendirme çağrılmaz — para harcanmaz", async () => {
  await openRoom();
  await startScene(/Kafede sipariş/);
  fireEvent.press(screen.getByText(/Bitir ve değerlendir/));
  await act(async () => {});
  expect(mockDebrief).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText(/Rol sahneleri/)).toBeTruthy()); // seçime döndü
});

test("değerlendirme çökerse ekran kilitlenmez, tekrar denenebilir", async () => {
  mockDebrief.mockRejectedValueOnce(new Error("Ağ koptu"));
  await openRoom();
  await startScene(/Kafede sipariş/);
  await waitFor(() => expect(dict().started).toBe(1));
  hear("مرحبا");
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(2));
  fireEvent.press(screen.getByText(/Bitir ve değerlendir/));
  await waitFor(() => expect(screen.getByText(/Ağ koptu/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Tekrar dene/));
  await waitFor(() => expect(mockDebrief).toHaveBeenCalledTimes(2));
});

// --- para ----------------------------------------------------------------------

test("harcama tavanı 'bağlantı hatası' gibi gösterilmez", async () => {
  const { BudgetExceededError, budgetStatus } = require("../src/budget");
  const status = budgetStatus({ todayUsd: 10, monthUsd: 10 }, { dailyTry: 1, monthlyTry: 1 }, 50);
  mockChat.mockRejectedValue(new BudgetExceededError(status));
  const { Alert } = require("react-native");
  const spy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  try {
    await openRoom();
    fireEvent.press(screen.getByText(/ile sesli sohbet/));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0]).toMatch(/Harcama tavanı doldu/);
  } finally {
    spy.mockRestore();
  }
});

// --- ses modeli ---------------------------------------------------------------

/** OpenAI ses tercihi + anahtarlı profil. */
function neuralProfile(transcribe = false): Profile {
  return {
    ...profile("A2"),
    provider: "anthropic",
    apiKeys: { anthropic: "sk-ant-x", openai: "sk-openai" },
    voice: { provider: "openai", voiceId: "nova", transcribe },
  } as unknown as Profile;
}

test("ses modeli seçiliyse hoca TELEFON TTS'iyle DEĞİL ses modeliyle konuşur", async () => {
  mockVoiceFetch.mockImplementation(okAudio);
  const Speech = require("expo-speech");
  render(<ConversationScreen profile={neuralProfile()} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/sesli sohbet/)).toBeTruthy());
  await startScene(/ile sesli sohbet/);
  await waitFor(() => expect(dict().started).toBe(1)); // sıra yine öğrenciye geçti
  expect(Speech.speak).not.toHaveBeenCalled(); // robot ses devrede değil
  expect(screen.getAllByText(/ses: OpenAI · nova/).length).toBeGreaterThan(0);
  expect(mockVoiceFetch).toHaveBeenCalled(); // ses gerçekten modele gitti
});

test("ses tercihi OpenAI ama ANAHTAR YOK → sessizce telefon sesine düşer", async () => {
  const p = { ...neuralProfile(), apiKeys: { anthropic: "sk-ant-x" } } as unknown as Profile;
  const Speech = require("expo-speech");
  render(<ConversationScreen profile={p} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/sesli sohbet/)).toBeTruthy());
  await startScene(/ile sesli sohbet/);
  await waitFor(() => expect(dict().started).toBe(1));
  expect(Speech.speak).toHaveBeenCalled();
  expect(screen.getAllByText(/ses: telefon/).length).toBeGreaterThan(0);
});

test("tanıma da ses modeline verilince telefonun tanıması AÇILMAZ", async () => {
  mockVoiceFetch.mockImplementation(okAudio);
  render(<ConversationScreen profile={neuralProfile(true)} onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/sesli sohbet/)).toBeTruthy());
  await startScene(/ile sesli sohbet/);
  await act(async () => {});
  expect(dict().started).toBe(0); // telefon tanıması değil, kayıt yolu
  expect(screen.getAllByText(/tanıma: OpenAI/).length).toBeGreaterThan(0);
});
