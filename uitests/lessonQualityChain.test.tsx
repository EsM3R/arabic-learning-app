/**
 * DERS KALİTESİ zinciri — uçtan uca.
 *
 * tests/lessonquality.test.ts ölçümün doğru hesaplandığını gösteriyor. Burada
 * ölçülen şey zincirin kapalı olduğu: ders → ölçüm → disk → HOCANIN PROMPTU.
 *
 * Bu ayrımın bedeli daha önce ödendi. Uygulamada birkaç kez aynı kusur çıktı:
 * bir şey doğru ölçülüyor, doğru kaydediliyor, ama hocaya hiç ulaşmıyor.
 * Hata çıkmaz, ekran normaldir, hoca sadece biraz daha genel konuşur ve kimse
 * fark etmez. Ölçülen ama söylenmeyen her şey, hiç ölçülmemiş sayılır.
 *
 * Bir de ölçümün KENDİSİNİ bozabilecek bir yol var: sınav ve serbest sohbet.
 * Sınavda hocanın tek kelimelik soru sorması ve öğrencinin kısa cevap vermesi
 * DOĞRU davranıştır; bunlar "hoca soru sormuyor, öğrenci üretmiyor" diye
 * kayda geçseydi karne, doğru çalışan bir ekran yüzünden bozulurdu.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";
import LessonScreen from "../src/screens/LessonScreen";
import { setActiveLanguage } from "../src/languages";
import { loadLessonQuality } from "../src/storage";
import type { CurriculumModule, Profile } from "../src/types";

const captured: { system: { dynamic?: string } | null; calls: number; reply: string } = {
  system: null,
  calls: 0,
  reply: "Merhaba, başlayalım.",
};
jest.mock("../src/claude", () => ({
  agenticChat: jest.fn(async (system: unknown) => {
    captured.system = system as { dynamic?: string };
    captured.calls += 1;
    return { text: captured.reply, actions: [] };
  }),
}));

const profile: Profile = {
  name: "Mehmet",
  apiKey: "sk-ant-x",
  completedModuleIds: [],
  assessment: {
    speakingLevel: "B2",
    readingLevel: "B2",
    strengths: [],
    weaknesses: [],
    summary: "",
  },
} as unknown as Profile;

const module_: CurriculumModule = {
  id: "m1",
  track: "konusma",
  title: "Tanışma",
  description: "…",
  level: "B2",
  objectives: ["x"],
};

function dynamicPrompt(): string {
  return captured.system?.dynamic ?? "";
}

/** Hocanın bu turda vereceği cevabı belirler. */
function teacherSays(text: string) {
  captured.reply = text;
}

let mounted: ReturnType<typeof render> | null = null;

function draw(opts: { module?: CurriculumModule | null; quiz?: boolean }) {
  mounted?.unmount(); // iki ağaç birden çizilmesin: sorgular ikilenir
  mounted = render(
    <LessonScreen
      profile={profile}
      module={opts.module === undefined ? module_ : opts.module}
      quiz={opts.quiz}
      onBack={() => {}}
      onCompleteModule={() => {}}
      onProfileChange={() => {}}
      onNavigate={() => {}}
    />
  );
}

/** İlk açılış: kayıtlı sohbet yoksa hoca dersi kendi başlatır. */
async function openLesson(opts: { module?: CurriculumModule | null; quiz?: boolean } = {}) {
  draw(opts);
  await waitFor(() => expect(captured.calls).toBeGreaterThan(0));
}

/**
 * Ekranı YENİDEN açar. Kayıtlı sohbet olduğu için hoca kendiliğinden
 * konuşmaz (doğru davranış: aynı dersi ikinci kez başlatmaz ve boşuna istek
 * harcamaz) — sonraki turu öğrenci başlatır.
 */
async function reopenLesson() {
  draw({});
  await waitFor(() => expect(screen.getByPlaceholderText(/yaz/i)).toBeTruthy());
  captured.calls = 0;
}

/** Öğrenci mesajı yazıp gönderir. */
async function studentSays(text: string) {
  const before = captured.calls;
  fireEvent.changeText(screen.getByPlaceholderText(/yaz/i), text);
  fireEvent.press(screen.getByLabelText("Gönder"));
  await waitFor(() => expect(captured.calls).toBeGreaterThan(before));
}

beforeEach(async () => {
  mounted = null;
  captured.system = null;
  captured.calls = 0;
  captured.reply = "Merhaba, başlayalım.";
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  // Bu testler yazı kutusunu sürer: yazılı düzende başla (sesli ders ayrı test edilir).
  await AsyncStorage.setItem("chatPrefs.v1", JSON.stringify({ voice: false, textScale: 1 }));
});

test("ders ölçülür ve DİSKE yazılır", async () => {
  teacherSays("Bugün evden konuşalım. Sen ne dersin?");
  await openLesson();
  await studentSays("البيت كبير");

  await waitFor(async () => {
    const list = await loadLessonQuality();
    expect(list).toHaveLength(1);
    expect(list[0].teacherTurns).toBeGreaterThan(0);
    expect(list[0].studentTurns).toBe(1);
  });
});

test("aynı ders TEK kayıt kalır — on beş turluk ders on beş ders sayılmaz", async () => {
  // Sayılsaydı uzun (yani iyi) bir ders, ortalamayı kendi başına belirlerdi.
  await openLesson();
  await studentSays("bir");
  await studentSays("iki");
  await studentSays("üç");

  const list = await loadLessonQuality();
  expect(list).toHaveLength(1);
  expect(list[0].studentTurns).toBe(3); // kayıt yerinde güncellendi
});

test("KICKOFF bildirimi öğrencinin sözü sayılmaz", async () => {
  // Sayılsaydı öğrenci tek kelime yazmadan söz payı varmış gibi görünürdü.
  await openLesson();
  await waitFor(async () => {
    const list = await loadLessonQuality();
    expect(list[0]?.studentTurns).toBe(0);
  });
});

test("SINAV ölçüme girmez — kısa cevaplar kusur sayılmamalı", async () => {
  // Sınavda hocanın tek kelimelik soru sorması doğru davranıştır; karne
  // doğru çalışan bir ekran yüzünden bozulmamalı.
  await openLesson({ module: null, quiz: true });
  await studentSays("بيت");
  expect(await loadLessonQuality()).toHaveLength(0);
});

test("SERBEST SOHBET de ölçüme girmez", async () => {
  await openLesson({ module: null });
  await studentSays("merhaba");
  expect(await loadLessonQuality()).toHaveLength(0);
});

test("ölçüm SONRAKİ dersin promptuna girer — zincirin kapandığı yer", async () => {
  // Uygulamanın birkaç kez yaşadığı kusur: doğru ölçülen bir şeyin hocaya
  // hiç ulaşmaması. Hata çıkmaz, hoca sadece biraz daha genel konuşur.
  teacherSays("Şimdi sana uzun uzun anlatayım. ".repeat(30));
  await openLesson();
  await studentSays("peki");
  await studentSays("tamam");
  await studentSays("evet");

  // Aynı ekranı yeniden aç: ölçüm diskten okunup prompta girmeli.
  await reopenLesson();
  await studentSays("devam");
  const d = dynamicPrompt();
  expect(d).toMatch(/ÖNCEKİ DERSİN ÖLÇÜMÜ/);
  expect(d).toMatch(/anlatıma dönüşmüş|fazla konuşuyor/);
});

test("hocaya giden özet ÖLÇÜMÜN NİTELİĞİNİ gizlemez", async () => {
  teacherSays("Şimdi sana uzun uzun anlatayım. ".repeat(30));
  await openLesson();
  await studentSays("peki");
  await studentSays("tamam");
  await studentSays("evet");

  await reopenLesson();
  await studentSays("devam");
  const d = dynamicPrompt();
  expect(d).toMatch(/yaklaşıktır/);
  expect(d).toMatch(/Öğrenciye bu ölçümlerden söz etme/);
});

test("İYİ giden derste prompta hiçbir şey eklenmez", async () => {
  // Boş bir başlık bile önbellek ön-ekini ve prompt bütçesini meşgul eder.
  teacherSays("كيف حالك اليوم؟");
  await openLesson();
  await studentSays("أنا بخير الحمد لله واليوم جميل جدا");
  await studentSays("البيت كبير وجميل جدا وأنا أحبه كثيرا");
  await studentSays("نعم أريد أن أتكلم عن عائلتي اليوم");

  await reopenLesson();
  await studentSays("نعم");
  expect(dynamicPrompt()).not.toMatch(/ÖNCEKİ DERSİN ÖLÇÜMÜ/);
});

test("ölçüm ÇÖKSE bile ders akmaya devam eder", async () => {
  // Karne dersin kritik yolunda değil; ölçüm yüzünden ders kesilmemeli.
  const storage = require("../src/storage");
  const spy = jest
    .spyOn(storage, "saveLessonQuality")
    .mockRejectedValue(new Error("disk dolu"));
  try {
    await openLesson();
    await studentSays("merhaba");
    expect(screen.getAllByText(/başlayalım/).length).toBeGreaterThan(0);
  } finally {
    spy.mockRestore();
  }
});
