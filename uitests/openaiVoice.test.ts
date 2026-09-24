/**
 * Ses modeli kuyruğu — "akıcı" hissin motoru.
 *
 * Kullanıcının şikâyeti: "ChatGPT akıcı konuşuyor, bizimki robot." Ses
 * modeline geçmek robotluğu çözer ama yeni bir tuzak açar: sentez ~0,5-1 sn
 * sürer. Cümleler sırayla sentezlenip çalınsaydı her cümle arasında o kadar
 * boşluk olurdu ve "akıcı" his yine kaçardı. Kuyruğun asıl işi bu yüzden
 * ÖN-GETİRME: N. cümle çalarken N+1 sentezlenir. Bunu görsel test ölçemez;
 * burada sentez isteğinin ne zaman atıldığı ölçülüyor.
 *
 * İkinci dikiş yedek: sentez düşerse cümle KAYBOLMAZ, telefon sesiyle okunur.
 * Sessizlik yerine robot ses — ama cümle gider.
 */
import { createNeuralSpeechQueue, synthesize, transcribe } from "../src/openaiVoice";
import { setActiveLanguage } from "../src/languages";
import { usageSummary } from "../src/usage";

type Deferred = { resolve: (r: unknown) => void; reject: (e: unknown) => void; url: string };
const pending: Deferred[] = [];
const mockFetch = jest.fn();
jest.mock("expo/fetch", () => ({ fetch: (...a: unknown[]) => mockFetch(...a) }));

/** Sentez isteğini beklet; test istediğinde cevaplar. */
function deferFetch() {
  mockFetch.mockImplementation(
    (url: string) =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject, url });
      })
  );
}
function okAudio(bytes = 3): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    json: async () => ({}),
  } as unknown as Response;
}
function fail(msg: string): Response {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: { message: msg } }),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const played = () =>
  (global as unknown as { __recorder: { played: { uri: string }[] } }).__recorder.played;

beforeEach(async () => {
  pending.length = 0;
  mockFetch.mockReset();
  played().length = 0;
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  const Speech = require("expo-speech");
  Speech.speak.mockReset();
});

test("cümleler SIRAYLA çalınır, hiçbiri iki kez ya da atlanarak değil", async () => {
  mockFetch.mockImplementation(async () => okAudio());
  const said: string[] = [];
  let idle = 0;
  const q = createNeuralSpeechQueue({
    apiKey: "sk-x",
    voiceId: "ash",
    onSentence: (s) => said.push(s),
    onIdle: () => {
      idle += 1;
    },
  });
  q.push("Bir.");
  q.push("İki.");
  q.push("Üç.");
  q.finish();
  for (let i = 0; i < 12; i += 1) await flush();
  expect(said).toEqual(["Bir.", "İki.", "Üç."]);
  expect(played()).toHaveLength(3);
  expect(idle).toBe(1);
});

test("ÖN-GETİRME: ikinci cümlenin sentezi birinci çalınmadan başlar", async () => {
  // Sıralı yapılsaydı her cümle arasında sentez süresi kadar boşluk olurdu.
  deferFetch();
  const q = createNeuralSpeechQueue({ apiKey: "sk-x", voiceId: "ash" });
  q.push("Bir.");
  q.push("İki.");
  await flush();
  expect(pending).toHaveLength(2); // ikisi de aynı anda istekte
  expect(played()).toHaveLength(0); // hiçbiri henüz çalmadı
});

test("sentez DÜŞERSE cümle telefon sesiyle okunur, kaybolmaz", async () => {
  mockFetch
    .mockImplementationOnce(async () => fail("kota"))
    .mockImplementation(async () => okAudio());
  const Speech = require("expo-speech");
  const reasons: string[] = [];
  const q = createNeuralSpeechQueue({
    apiKey: "sk-x",
    voiceId: "ash",
    onFallback: (r) => reasons.push(r),
  });
  q.push("Bir.");
  q.push("İki.");
  q.finish();
  for (let i = 0; i < 12; i += 1) await flush();
  expect(reasons[0]).toMatch(/kota/);
  expect(Speech.speak).toHaveBeenCalledTimes(1); // yalnız düşen cümle
  expect(Speech.speak.mock.calls[0][0]).toBe("Bir.");
});

test("cancel: kuyruk boşalır, onIdle ÇAĞRILMAZ, geç gelen ses çalınmaz", async () => {
  // Kesilen konuşmanın ardından mikrofon açılsaydı öğrenci yarım bir sıraya
  // cevap vermek zorunda kalırdı.
  deferFetch();
  let idle = 0;
  const q = createNeuralSpeechQueue({
    apiKey: "sk-x",
    voiceId: "ash",
    onIdle: () => {
      idle += 1;
    },
  });
  q.push("Bir.");
  q.push("İki.");
  await flush();
  q.cancel();
  q.finish();
  for (const p of pending) p.resolve(okAudio()); // sesler geç geldi
  for (let i = 0; i < 12; i += 1) await flush();
  expect(played()).toHaveLength(0);
  expect(idle).toBe(0);
  expect(q.speaking).toBe(false);
});

test("boş cevapta finish() sırayı yine öğrenciye verir", () => {
  let idle = 0;
  const q = createNeuralSpeechQueue({
    apiKey: "sk-x",
    voiceId: "ash",
    onIdle: () => {
      idle += 1;
    },
  });
  q.finish();
  expect(idle).toBe(1);
});

test("sentez maliyeti SAYAÇA yazılır — tavan sesi de kapsar", async () => {
  mockFetch.mockImplementation(async () => okAudio());
  await synthesize("sk-x", "x".repeat(9000), "ash");
  await flush();
  const u = await usageSummary();
  expect(u.todayCalls).toBe(1);
  expect(u.todayUsd).toBeGreaterThan(0);
});

test("sentez isteği dili ve doğal-konuşma yönergesini taşır, okunuş parantezini atar", async () => {
  mockFetch.mockImplementation(async () => okAudio());
  await synthesize("sk-x", "أَهْلاً (ehlen) 😊", "nova");
  const [url, init] = mockFetch.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
  expect(url).toMatch(/audio\/speech/);
  expect(init.headers.Authorization).toBe("Bearer sk-x");
  const body = JSON.parse(init.body);
  expect(body.voice).toBe("nova");
  expect(body.input).toBe("أَهْلاً"); // temizlendi, hareke kaldı
  expect(body.instructions).toMatch(/Arapça/);
});

test("tanıma: dosya çok parçalı gider, dil kodu ve süre maliyeti yazılır", async () => {
  const fs = (global as unknown as { __fs: Map<string, unknown> }).__fs;
  fs.set("file:///rec.m4a", new Uint8Array([1, 2, 3]));
  mockFetch.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ text: "  البيت كبير " }),
  }));
  const text = await transcribe("sk-x", "file:///rec.m4a", "ar", 7);
  expect(text).toBe("البيت كبير");
  const [url, init] = mockFetch.mock.calls[0] as [string, { body: FormData }];
  expect(url).toMatch(/audio\/transcriptions/);
  expect(init.body).toBeInstanceOf(FormData);
  await flush();
  const u = await usageSummary();
  expect(u.todayCalls).toBe(1);
});

test("tanıma hatası ANLAŞILIR mesajla döner — 'HTTP 500' değil", async () => {
  mockFetch.mockImplementation(async () => fail("Invalid file format"));
  const fs = (global as unknown as { __fs: Map<string, unknown> }).__fs;
  fs.set("file:///rec.m4a", new Uint8Array([1]));
  await expect(transcribe("sk-x", "file:///rec.m4a", "ar", 1)).rejects.toThrow(/Invalid file format/);
});
