/**
 * Harcama tavanı BEKÇİSİ — src/claude.ts.
 *
 * tests/budget.test.ts tavanın kararını ölçüyor; burada ölçülen şey kararın
 * GERÇEKTEN UYGULANDIĞI. İkisi ayrı mesele: kusursuz çalışan bir tavan
 * mantığı, çağrı yoluna bağlanmamışsa hiçbir şey yapmaz ve bunu hiçbir test
 * fark etmez — fatura fark eder.
 *
 * Para harcayan dört yol var (ders, müfredat, okuma metni, telaffuz seti) ve
 * dördü de ayrı ayrı sınanıyor. Sebebi şu: bekçi tek yerde toplandı ama
 * sonradan eklenen bir çağrı yolu onu atlayabilir; o zaman uygulama "tavan
 * var" der, tavan yoktur.
 */
import {
  agenticChat,
  generateCurriculum,
  generatePronunciationSet,
  generateReadingText,
  testConnection,
} from "../src/claude";
import { isBudgetError } from "../src/budget";
import { setActiveLanguage } from "../src/languages";
import { recordUsage } from "../src/usage";
import type { Assessment, Profile } from "../src/types";

/** Sağlayıcı katmanı taklit: ağ yok, ama ÇAĞRILDI MI ölçülüyor. */
const mockChat = jest.fn();
const mockStructured = jest.fn();
jest.mock("../src/providers", () => {
  const actual = jest.requireActual("../src/providers");
  const fake = {
    meta: {
      id: "anthropic",
      label: "Anthropic (Claude)",
      keyPrefix: "sk-ant-",
      defaultModel: "m",
      models: ["m"],
      keyHint: "",
      costNote: "",
    },
    chat: (...a: unknown[]) => mockChat(...a),
    structured: (...a: unknown[]) => mockStructured(...a),
  };
  return {
    ...actual,
    PROVIDERS: { anthropic: fake },
    PROVIDER_LIST: [fake],
    activeSetup: () => ({ provider: fake, model: "m", apiKey: "sk-ant-x" }),
  };
});

function profile(over: Partial<Profile> = {}): Profile {
  return {
    name: "Mehmet",
    apiKey: "sk-ant-x",
    provider: "anthropic",
    apiKeys: { anthropic: "sk-ant-x" },
    completedModuleIds: [],
    ...over,
  } as unknown as Profile;
}

const assessment: Assessment = {
  speakingLevel: "A1",
  readingLevel: "A1",
  strengths: [],
  weaknesses: [],
  summary: "",
};

/** Tavanı aşacak kadar harcama kaydeder (fiyatlandırma gerçek modülden gelir). */
async function spendALot() {
  for (let i = 0; i < 40; i += 1) {
    await recordUsage({ model: "claude-opus-5", input: 1_000_000, output: 200_000 });
  }
}

const ctx = () => ({ profile: profile(), profileChanged: false });

beforeEach(async () => {
  mockChat.mockReset();
  mockChat.mockResolvedValue({ text: "selam", actions: [] });
  mockStructured.mockReset();
  mockStructured.mockResolvedValue({ modules: [], items: [], minimalPairs: [] });
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

test("tavanın altındayken ders normal çalışır", async () => {
  const reply = await agenticChat("sistem", [{ role: "user", content: "merhaba" }], ctx());
  expect(reply.text).toBe("selam");
  expect(mockChat).toHaveBeenCalledTimes(1);
});

test("tavan dolunca DERS isteği gönderilmez", async () => {
  await spendALot();
  await expect(
    agenticChat("sistem", [{ role: "user", content: "merhaba" }], ctx())
  ).rejects.toThrow(/tavan/i);
  expect(mockChat).not.toHaveBeenCalled(); // asıl ölçü: ağa çıkılmadı
});

test("tavan dolunca MÜFREDAT kurulmaz", async () => {
  await spendALot();
  await expect(generateCurriculum(profile(), assessment)).rejects.toThrow(/tavan/i);
  expect(mockStructured).not.toHaveBeenCalled();
});

test("tavan dolunca OKUMA METNİ üretilmez", async () => {
  await spendALot();
  await expect(
    generateReadingText(profile(), [], { length: "orta" })
  ).rejects.toThrow(/tavan/i);
  expect(mockStructured).not.toHaveBeenCalled();
});

test("tavan dolunca TELAFFUZ SETİ üretilmez", async () => {
  await spendALot();
  await expect(generatePronunciationSet(profile(), [], [])).rejects.toThrow(/tavan/i);
  expect(mockStructured).not.toHaveBeenCalled();
});

test("engel AYIRT EDİLEBİLİR bir hata türüdür", async () => {
  // Ders ekranı buna bakıp "Bağlantı hatası" yerine "Harcama tavanı doldu"
  // diyor; ayırt edilemezse kullanıcı olmayan bir ağ sorunu arar.
  await spendALot();
  await agenticChat("sistem", [{ role: "user", content: "x" }], ctx()).then(
    () => {
      throw new Error("engellenmeliydi");
    },
    (e) => {
      expect(isBudgetError(e)).toBe(true);
      expect(String(e.message)).toMatch(/Ayarlar → Harcama tavanı/);
    }
  );
});

test("BAĞLANTI SINAMASI tavandan etkilenmez — teşhis yolu açık kalır", async () => {
  // Tavan dolduğunda "neden çalışmıyor" sorusunun cevabını bulmanın tek yolu
  // bu. Onu da kapatmak kullanıcıyı karanlıkta bırakırdı.
  await spendALot();
  const res = await testConnection(profile(), "anthropic");
  expect(mockChat).toHaveBeenCalledTimes(1);
  expect(res.ok).toBe(true);
});

test("kullanıcı tavanı YÜKSELTİNCE ders yeniden çalışır", async () => {
  await spendALot();
  const rich = profile({ budget: { dailyTry: 100_000, monthlyTry: 100_000 } });
  const reply = await agenticChat("sistem", [{ role: "user", content: "x" }], {
    profile: rich,
    profileChanged: false,
  });
  expect(reply.text).toBe("selam");
});

test("tavan KAPATILINCA (0) engel kalkar", async () => {
  await spendALot();
  const free = profile({ budget: { dailyTry: 0, monthlyTry: 0 } });
  await agenticChat("sistem", [{ role: "user", content: "x" }], {
    profile: free,
    profileChanged: false,
  });
  expect(mockChat).toHaveBeenCalledTimes(1);
});

test("sayaç OKUNAMAZSA ders kesilmez — bekçi engel değil korumadır", async () => {
  // Depo arızasında öğrenciyi çalışmaktan alıkoymak, korumanın kendisinden
  // daha büyük zarar olurdu.
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  const spy = jest.spyOn(AsyncStorage, "getItem").mockRejectedValue(new Error("depo bozuk"));
  try {
    const reply = await agenticChat("sistem", [{ role: "user", content: "x" }], ctx());
    expect(reply.text).toBe("selam");
  } finally {
    spy.mockRestore();
  }
});
