/**
 * "Hocaya sor" — modelin cevabı şemadan sapsa da metin bulunur.
 *
 * Telefonda "Modelden boş yanıt geldi" görüldü: şemayı uygulamayan sağlayıcı
 * metni "a" yerine başka adla yazınca cevap boş sayılıyordu.
 */
import { askBuildTeacher, pickAnswerText } from "../src/claude";
import { setActiveLanguage } from "../src/languages";
import { EMPTY_TEXT } from "../src/providers/types";
import type { Profile } from "../src/types";

const mockStructured = jest.fn();
jest.mock("../src/providers", () => {
  const actual = jest.requireActual("../src/providers");
  const fake = {
    meta: { id: "anthropic", label: "A", keyPrefix: "sk-ant-", defaultModel: "m", models: ["m"], keyHint: "", costNote: "" },
    chat: jest.fn(),
    structured: (...a: unknown[]) => mockStructured(...a),
  };
  return { ...actual, PROVIDERS: { anthropic: fake }, PROVIDER_LIST: [fake], activeSetup: () => ({ provider: fake, model: "m", apiKey: "sk-ant-x" }) };
});

const profile = { name: "Mehmet", apiKey: "sk-ant-x", provider: "anthropic", apiKeys: { anthropic: "sk-ant-x" }, completedModuleIds: [] } as unknown as Profile;
const input = { lang: "en" as const, tr: "Her akşam evdeyim.", target: "I am at home every evening." };

beforeEach(async () => {
  mockStructured.mockReset();
  setActiveLanguage("en");
  await require("@react-native-async-storage/async-storage").clear();
});

test("alan adı farklıysa en uzun metin alınır", () => {
  expect(pickAnswerText({ a: "Cevap" })).toBe("Cevap");
  expect(pickAnswerText({ cevap: "Uzun cevap metni", x: "k" })).toBe("Uzun cevap metni");
  expect(pickAnswerText({ answer: { text: "İç içe" } })).toBe("İç içe");
  expect(pickAnswerText({ a: "" })).toBe("");
});

test("başka adla gelen cevap gösterilir", async () => {
  mockStructured.mockResolvedValueOnce({ answer: "Şöyle de denir: I stay home." });
  await expect(askBuildTeacher(profile, input, "Başka nasıl söylenir?")).resolves.toBe("Şöyle de denir: I stay home.");
});

test("boş cevapta bir kez daha dener", async () => {
  mockStructured.mockRejectedValueOnce(new Error(EMPTY_TEXT)).mockResolvedValueOnce({ a: "İkinci denemede geldi." });
  await expect(askBuildTeacher(profile, input, "Neden?")).resolves.toBe("İkinci denemede geldi.");
  expect(mockStructured).toHaveBeenCalledTimes(2);
});

test("anlatım raporu güvenli biçime getirilir", () => {
  const { normalizeStoryReport } = require("../src/claude");
  const r = normalizeStoryReport(
    { score: 140, covered: [0, 0, 5, 1, "x"], links: ["and", "and", ""], fixes: [["a", "b", "neden"], ["same", "same", ""], { said: "c", better: "d", why: "w" }] },
    3
  );
  expect(r.score).toBe(100);
  expect(r.covered).toEqual([0, 1]);
  expect(r.links).toEqual(["and"]);
  expect(r.fixes).toEqual([
    { said: "a", better: "b", why: "neden" },
    { said: "c", better: "d", why: "w" },
  ]);
});
