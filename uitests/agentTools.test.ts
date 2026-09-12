/**
 * Hocanın ARAÇ DÖNGÜSÜ — src/agent.ts (882 satır) şimdiye kadar hiç test
 * edilmemişti.
 *
 * Neden önemli: bu araçlar uygulamanın YAZMA yüzeyi. Hoca kelimeyi buradan
 * kaydeder, hatayı buradan kapatır, seviyeyi buradan değiştirir. Bir araç
 * sessizce çalışmazsa hiçbir hata çıkmaz — model "kaydettim" der, öğrenci
 * inanır, defter boş kalır. Bu, uygulamanın verebileceği en pahalı zarar.
 *
 * Jest projesinde koşuyor çünkü agent.ts cihaz modüllerine (AsyncStorage,
 * bildirimler) bağlı; saf node testleri onu yükleyemez.
 */
import { executeTool, TEACHER_TOOLS } from "../src/agent";
import type { AgentContext } from "../src/agent";
import { setActiveLanguage } from "../src/languages";
import { loadMistakes, loadNotes, loadVocab } from "../src/storage";
import type { Profile } from "../src/types";

function ctx(over: Partial<Profile> = {}): AgentContext {
  return {
    profile: {
      name: "Mehmet",
      apiKey: "sk-x",
      completedModuleIds: [],
      assessment: {
        speakingLevel: "A1",
        readingLevel: "A1",
        weaknesses: [],
        strengths: [],
        updatedAt: "2026-09-12T00:00:00.000Z",
      },
      ...over,
    } as unknown as Profile,
    profileChanged: false,
  };
}

beforeEach(async () => {
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

// --- araç tanımları ---------------------------------------------------------

test("her aracın adı, tarifi ve şeması var", () => {
  // Tarifsiz araç modelin gözünde yok gibidir: çağırmaz, çağırırsa yanlış çağırır.
  expect(TEACHER_TOOLS.length).toBeGreaterThan(10);
  for (const t of TEACHER_TOOLS) {
    expect(t.name).toMatch(/^[a-z_]+$/);
    expect((t.description ?? "").length).toBeGreaterThan(30);
    expect(t.input_schema).toBeTruthy();
  }
});

test("araç adları benzersiz", () => {
  const names = TEACHER_TOOLS.map((t) => t.name);
  expect(new Set(names).size).toBe(names.length);
});

test("tanımlı her aracın bir uygulaması var", async () => {
  // Şemada olup switch'te olmayan araç, modelin çağırıp boş döndüğü bir
  // kara deliktir — en sinsi sessiz başarısızlık biçimi.
  for (const t of TEACHER_TOOLS) {
    const out = await executeTool(t.name, {}, ctx());
    expect(out.result).not.toMatch(/Bilinmeyen araç/);
  }
});

// --- kelime defteri ---------------------------------------------------------

test("kelime_kaydet gerçekten deftere yazar", async () => {
  const out = await executeTool(
    "kelime_kaydet",
    { arabic: "كِتَاب", transliteration: "kitâb", turkish: "kitap", track: "okuma" },
    ctx()
  );
  expect(out.summary).toMatch(/Kelime eklendi/);
  const cards = await loadVocab();
  expect(cards).toHaveLength(1);
  expect(cards[0].arabic).toBe("كِتَاب");
  expect(cards[0].turkish).toBe("kitap");
});

test("boş kelime kaydedilmez ve ÇÖKMEZ", async () => {
  const out = await executeTool("kelime_kaydet", { turkish: "kitap" }, ctx());
  expect(out.result).toMatch(/Hata/);
  expect(await loadVocab()).toHaveLength(0);
});

test("aynı kelime iki kez yazılmaz — defter şişmez", async () => {
  const input = { arabic: "بَيْت", turkish: "ev" };
  await executeTool("kelime_kaydet", input, ctx());
  const again = await executeTool("kelime_kaydet", input, ctx());
  expect(again.result).toMatch(/zaten kayıtlı/);
  expect(await loadVocab()).toHaveLength(1);
});

test("kelime_puanla tekrar takvimini gerçekten ilerletir", async () => {
  await executeTool("kelime_kaydet", { arabic: "بَاب", turkish: "kapı" }, ctx());
  const before = (await loadVocab())[0];
  await executeTool("kelime_puanla", { id: before.id, sonuc: "bildi" }, ctx());
  const after = (await loadVocab())[0];
  expect(after.reps).toBeGreaterThan(before.reps);
  expect(new Date(after.due).getTime()).toBeGreaterThan(new Date(before.due).getTime());
});

test("olmayan kelimeyi puanlamak çökertmez", async () => {
  const out = await executeTool("kelime_puanla", { id: "yok-boyle", sonuc: "bildi" }, ctx());
  expect(out.result.length).toBeGreaterThan(0);
});

// --- hata defteri -----------------------------------------------------------

test("hata_kaydet yazar, hata_cozuldu KAPATIR", async () => {
  // Kapatma çalışmazsa hata defteri hiç boşalmaz ve hoca aynı konuyu
  // sonsuza kadar işler.
  await executeTool(
    "hata_kaydet",
    { konu: "i'râb", hata: "الكتابُ", duzeltme: "الكتابَ", aciklama: "mef'ûl mansûbtur" },
    ctx()
  );
  const open = await loadMistakes();
  expect(open).toHaveLength(1);
  expect(open[0].resolved).toBeFalsy();

  await executeTool("hata_cozuldu", { id: open[0].id }, ctx());
  const after = await loadMistakes();
  expect(after[0].resolved).toBe(true);
});

test("aynı konudaki hata TEKRAR SAYACINI artırır, yeni kayıt açmaz", async () => {
  const input = {
    konu: "geçmiş zaman",
    hata: "yanlış",
    duzeltme: "doğru",
    aciklama: "çünkü",
  };
  await executeTool("hata_kaydet", input, ctx());
  await executeTool("hata_kaydet", { ...input, hata: "başka yanlış" }, ctx());
  const list = await loadMistakes();
  expect(list).toHaveLength(1);
  expect(list[0].timesSeen).toBeGreaterThan(1);
});

// --- notlar -----------------------------------------------------------------

test("not_yaz hocanın hafızasına yazar", async () => {
  await executeTool("not_yaz", { note: "Öğrenci ikil uyumunda zorlanıyor." }, ctx());
  const notes = await loadNotes();
  expect(notes).toHaveLength(1);
  expect(notes[0].note).toMatch(/ikil/);
});

// --- seviye -----------------------------------------------------------------

test("seviye BİR kademeden fazla yükseltilemez", async () => {
  // Model kibarlık ya da coşkuyla iki kademe atlatabilir; uygulama reddeder.
  const c = ctx();
  const out = await executeTool("seviye_guncelle", { speakingLevel: "B2" }, c);
  expect(out.result).toMatch(/yazılmadı|kabul edilmiyor/i);
  expect(out.result).toMatch(/A2/); // ne yapması gerektiğini de söylemeli
  expect(c.profile.assessment?.speakingLevel).toBe("A1");
});

test("bir kademe yükseltme kabul edilir ve profil DEĞİŞTİ olarak işaretlenir", async () => {
  const c = ctx();
  await executeTool("seviye_guncelle", { speakingLevel: "A2" }, c);
  expect(c.profile.assessment?.speakingLevel).toBe("A2");
  expect(c.profileChanged).toBe(true);
});

test("seviye düşürme serbesttir", async () => {
  const c = ctx({
    assessment: {
      speakingLevel: "B1",
      readingLevel: "B1",
      weaknesses: [],
      strengths: [],
      summary: "",
      updatedAt: "2026-09-12T00:00:00.000Z",
    },
  } as unknown as Partial<Profile>);
  await executeTool("seviye_guncelle", { speakingLevel: "A1" }, c);
  expect(c.profile.assessment?.speakingLevel).toBe("A1");
});

// --- yönlendirme ------------------------------------------------------------

test("ekrana_git öneriyi bağlama yazar, zorlamaz", async () => {
  const c = ctx();
  const out = await executeTool("ekrana_git", { screen: "fluency", label: "Akıcılık Odası" }, c);
  expect(out.result).not.toMatch(/geçersiz ekran/);
  expect(c.pendingNavigation?.screen).toBe("fluency");
});

test("araç ŞEMASI ile çalışma-zamanı doğrulaması AYRIŞAMAZ", async () => {
  // Gerçek hata: "fluency" şemaya eklendi, doğrulama listesine eklenmedi.
  // Model geçerli sandığı çağrıyı yapıyor, uygulama sessizce reddediyordu.
  const tool = TEACHER_TOOLS.find((t) => t.name === "ekrana_git");
  const schema = tool?.input_schema as { properties: { screen: { enum: string[] } } };
  for (const screen of schema.properties.screen.enum) {
    const c = ctx();
    const out = await executeTool("ekrana_git", { screen, label: "x" }, c);
    // "module" id ister; onun dışındaki her şema değeri kabul edilmeli.
    if (screen === "module") continue;
    expect(out.result).not.toMatch(/geçersiz ekran/);
  }
});

test("bilinmeyen ekran önerisi sessizce geçmez", async () => {
  const c = ctx();
  const out = await executeTool("ekrana_git", { screen: "uzay-istasyonu", label: "x" }, c);
  expect(out.result.length).toBeGreaterThan(0);
});

// --- bilinmeyen araç --------------------------------------------------------

test("bilinmeyen araç adı ÇÖKERTMEZ, anlaşılır cevap döner", async () => {
  const out = await executeTool("uydurma_arac", { a: 1 }, ctx());
  expect(out.result.length).toBeGreaterThan(0);
});
