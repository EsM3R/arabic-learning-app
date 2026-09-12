/**
 * Seviye Değerlendirmesi ekranı testi.
 *
 * Burada verilen karar HAFTALARI belirliyor: yeni müfredat kurulduğunda
 * öğrenci onu çalışacak. İki ayrı sessiz kusur mümkün.
 *
 * Birincisi çifte harcama: değerlendirme ağır bir istek (maxRounds 8, yüksek
 * çaba). React ekranı iki kez kurarsa (geliştirme kipi, yeniden render)
 * öğrenci tek dokunuşla iki kez ödeyebilir — ekranda hiçbir belirti olmaz.
 *
 * İkincisi güdük müfredat: model kısa bir liste döndürürse ekran onu kabul
 * edip "hazır" diyebilir. O zaman öğrenci haftalarca 3 modüllük bir plana
 * çalışır ve bunun eksik olduğunu asla öğrenemez. Kısa müfredat SESSİZCE
 * kabul edilmemeli.
 */
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react-native";
import React from "react";
import LevelUpScreen from "../src/screens/LevelUpScreen";
import { setActiveLanguage } from "../src/languages";
import type { Assessment, Curriculum, Profile } from "../src/types";

type Ctx = { profile: Profile; profileChanged: boolean };

const mockChat = jest.fn();
const mockCurriculum = jest.fn();
jest.mock("../src/claude", () => ({
  agenticChat: (...args: unknown[]) => mockChat(...args),
  generateCurriculum: (...args: unknown[]) => mockCurriculum(...args),
}));

function assessment(over: Partial<Assessment> = {}): Assessment {
  return {
    speakingLevel: "A1",
    readingLevel: "A2",
    strengths: [],
    weaknesses: [],
    summary: "",
    ...over,
  };
}

function profile(over: Partial<Profile> = {}): Profile {
  return {
    name: "Mehmet",
    apiKey: "sk-ant-x",
    completedModuleIds: [],
    assessment: assessment(),
    ...over,
  } as unknown as Profile;
}

function curriculum(count: number): Curriculum {
  return {
    generatedAt: "2026-09-12T00:00:00.000Z",
    modules: Array.from({ length: count }, (_, i) => ({
      id: `m${i}`,
      track: "okuma" as const,
      title: `Modül ${i}`,
      description: "…",
      level: "A2",
      objectives: ["x"],
    })),
  };
}

const completed: { assessment: Assessment; curriculum: Curriculum }[] = [];
let backs = 0;

beforeEach(async () => {
  completed.length = 0;
  backs = 0;
  mockChat.mockReset();
  mockChat.mockImplementation(async () => ({ text: "Okuman ilerledi, konuşman geride.", actions: [] }));
  mockCurriculum.mockReset();
  mockCurriculum.mockResolvedValue(curriculum(12));
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

async function open(p: Profile = profile()) {
  render(
    <LevelUpScreen
      profile={p}
      onComplete={(a, c) => completed.push({ assessment: a, curriculum: c })}
      onBack={() => {
        backs += 1;
      }}
    />
  );
  await waitFor(() => expect(screen.getByText(/Yeni müfredatı hazırla/)).toBeTruthy());
}

// --- harcama ----------------------------------------------------------------

test("değerlendirme isteği YALNIZCA BİR KEZ atılır", async () => {
  // Ağır bir istek: iki kez atılması sessizce iki kat ödeme demek.
  const { rerender } = render(
    <LevelUpScreen profile={profile()} onComplete={() => {}} onBack={() => {}} />
  );
  await waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));
  rerender(<LevelUpScreen profile={profile()} onComplete={() => {}} onBack={() => {}} />);
  await act(async () => {});
  expect(mockChat).toHaveBeenCalledTimes(1);
});

test("karar ÖNCE gösterilir, müfredat sonra kurulur", async () => {
  // Öğrenci hocanın gerekçesini görmeden ikinci bir istek harcamamalı.
  await open();
  expect(screen.getByText(/konuşman geride/)).toBeTruthy();
  expect(mockCurriculum).not.toHaveBeenCalled();
});

test("'Şimdi değil' müfredat kurmaz — ikinci istek harcanmaz", async () => {
  await open();
  fireEvent.press(screen.getByText(/Şimdi değil/));
  await act(async () => {});
  expect(mockCurriculum).not.toHaveBeenCalled();
  expect(backs).toBe(1);
});

// --- seviye kararı ----------------------------------------------------------

test("hoca seviyeyi yükseltirse ekran ESKİ → YENİ olarak gösterir", async () => {
  mockChat.mockImplementation(async (_s: unknown, _m: unknown, ctx: Ctx) => {
    ctx.profile = { ...ctx.profile, assessment: assessment({ speakingLevel: "A2" }) };
    ctx.profileChanged = true;
    return { text: "Konuşman A2 oldu.", actions: [] };
  });
  await open();
  expect(screen.getByText("A1 → A2")).toBeTruthy();
  expect(screen.getByText("A2")).toBeTruthy(); // okuma aynı kaldı
  expect(screen.getByText(/müfredatın baştan kurulacak/)).toBeTruthy();
});

test("seviye AYNI kalırsa ok gösterilmez ve sebep söylenir", async () => {
  // "Yükselmedin" demek yetmez; öğrenci neden devam edeceğini bilmeli.
  await open();
  expect(screen.queryByText(/→/)).toBeNull();
  expect(screen.getByText(/eksik kalan yerlere odaklanacak/)).toBeTruthy();
});

test("yükselen seviye MÜFREDATA da geçer — karar ile plan ayrışmaz", async () => {
  mockChat.mockImplementation(async (_s: unknown, _m: unknown, ctx: Ctx) => {
    ctx.profile = { ...ctx.profile, assessment: assessment({ speakingLevel: "A2" }) };
    ctx.profileChanged = true;
    return { text: "Yükseldin.", actions: [] };
  });
  await open();
  fireEvent.press(screen.getByText(/Yeni müfredatı hazırla/));
  await waitFor(() => expect(completed).toHaveLength(1));
  expect(completed[0].assessment.speakingLevel).toBe("A2");
  expect((mockCurriculum.mock.calls[0][1] as Assessment).speakingLevel).toBe("A2");
});

// --- güdük müfredat ---------------------------------------------------------

test("KISA müfredat sessizce kabul edilmez", async () => {
  // Kabul edilseydi öğrenci haftalarca eksik bir plana çalışır ve bunu
  // hiçbir zaman öğrenemezdi.
  mockCurriculum.mockResolvedValueOnce(curriculum(3));
  await open();
  fireEvent.press(screen.getByText(/Yeni müfredatı hazırla/));
  await waitFor(() => expect(screen.getByText(/beklenenden kısa/)).toBeTruthy());
  expect(completed).toHaveLength(0);
});

test("hata sonrası TEKRAR DENE gerçekten yeniden kurar", async () => {
  mockCurriculum.mockRejectedValueOnce(new Error("Ağ koptu"));
  await open();
  fireEvent.press(screen.getByText(/Yeni müfredatı hazırla/));
  await waitFor(() => expect(screen.getByText(/Ağ koptu/)).toBeTruthy());

  fireEvent.press(screen.getByText(/Tekrar dene/));
  await waitFor(() => expect(completed).toHaveLength(1));
  expect(completed[0].curriculum.modules).toHaveLength(12);
});

test("değerlendirme çökerse ekran boş kalmaz, çıkış yolu kalır", async () => {
  mockChat.mockRejectedValueOnce(new Error("Kota bitti"));
  render(<LevelUpScreen profile={profile()} onComplete={() => {}} onBack={() => { backs += 1; }} />);
  await waitFor(() => expect(screen.getByText(/Kota bitti/)).toBeTruthy());
  fireEvent.press(screen.getByText(/Panele dön/));
  expect(backs).toBe(1);
});

test("seviye bilgisi OLMAYAN profilde müfredat kurulmaz", async () => {
  // Seviyesiz müfredat üretmek, rastgele bir seviyeye plan yapmak demektir.
  await open(profile({ assessment: undefined } as unknown as Partial<Profile>));
  fireEvent.press(screen.getByText(/Yeni müfredatı hazırla/));
  await waitFor(() => expect(screen.getByText(/Seviye bilgisi okunamadı/)).toBeTruthy());
  expect(mockCurriculum).not.toHaveBeenCalled();
});
