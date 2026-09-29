/**
 * Cümle Kurma seti — cevap uzunluk sınırına takılınca.
 *
 * Düşünen modeller (DeepSeek) düşünmeyi de cevap sınırından harcıyor; uzun
 * set yarıda kesiliyordu ve öğrenci "Set hazırlanamadı" ile kalıyordu.
 * Artık kesilirse uygulama KISA bir setle kendisi bir kez daha dener.
 */
import { generateBuildSet } from "../src/claude";
import { setActiveLanguage } from "../src/languages";
import { TRUNCATED_TEXT } from "../src/providers/types";
import { PATTERN_LADDER, THEMES } from "../src/sentencebuilding";
import type { Profile } from "../src/types";

const mockStructured = jest.fn();
jest.mock("../src/providers", () => {
  const actual = jest.requireActual("../src/providers");
  const fake = {
    meta: { id: "anthropic", label: "A", keyPrefix: "sk-ant-", defaultModel: "m", models: ["m"], keyHint: "", costNote: "" },
    chat: jest.fn(),
    structured: (...a: unknown[]) => mockStructured(...a),
  };
  return {
    ...actual,
    PROVIDERS: { anthropic: fake },
    PROVIDER_LIST: [fake],
    activeSetup: () => ({ provider: fake, model: "m", apiKey: "sk-ant-x" }),
  };
});

const profile = {
  name: "Mehmet",
  apiKey: "sk-ant-x",
  provider: "anthropic",
  apiKeys: { anthropic: "sk-ant-x" },
  completedModuleIds: [],
} as unknown as Profile;

function sentence(i: number) {
  return {
    tr: `Cümle ${i}`,
    steps: [
      { question: "", trPiece: "p", trSoFar: "p", target: `t${i}`, alts: [], translit: "", note: "" },
      { question: "Ne?", trPiece: "q", trSoFar: "p q", target: `t${i} q`, alts: [], translit: "", note: "" },
    ],
    blocks: [],
    reorder: "",
  };
}
const goodSet = { intro: "x", sentences: [sentence(1), sentence(2), sentence(3)] };

beforeEach(async () => {
  mockStructured.mockReset();
  setActiveLanguage("en");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

test("ilk istek 5-6 cümle ister", async () => {
  mockStructured.mockResolvedValueOnce(goodSet);
  await generateBuildSet(profile, PATTERN_LADDER[0], THEMES[0], []);
  expect(mockStructured).toHaveBeenCalledTimes(1);
  expect((mockStructured.mock.calls[0][0] as { system: string }).system).toMatch(/5-6 Türkçe cümle/);
});

test("kesilirse KISA setle kendiliğinden bir kez daha dener", async () => {
  mockStructured.mockRejectedValueOnce(new Error(TRUNCATED_TEXT)).mockResolvedValueOnce(goodSet);
  const set = await generateBuildSet(profile, PATTERN_LADDER[0], THEMES[0], []);
  expect(set.sentences).toHaveLength(3);
  expect(mockStructured).toHaveBeenCalledTimes(2);
  expect((mockStructured.mock.calls[1][0] as { system: string }).system).toMatch(/3-4 Türkçe cümle/);
});

test("iki kez kesilirse anlaşılır bir hata verir, sonsuz denemez", async () => {
  mockStructured.mockRejectedValue(new Error(TRUNCATED_TEXT));
  await expect(generateBuildSet(profile, PATTERN_LADDER[0], THEMES[0], [])).rejects.toThrow(/iki denemede/);
  expect(mockStructured).toHaveBeenCalledTimes(2);
});

test("başka hata tekrar denetmez", async () => {
  mockStructured.mockRejectedValueOnce(new Error("Ağ koptu"));
  await expect(generateBuildSet(profile, PATTERN_LADDER[0], THEMES[0], [])).rejects.toThrow(/Ağ koptu/);
  expect(mockStructured).toHaveBeenCalledTimes(1);
});
