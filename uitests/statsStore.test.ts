/**
 * Sayaç yazmalarının SIRALANMASI.
 *
 * Gerçek hata: recordStat oku-değiştir-yaz yapıyordu ve ekranlar tek bir
 * doğru cevapta dört sayaç birden artırıyordu. Hepsi aynı anlık görüntüyü
 * okuyup birbirinin üstüne yazıyor, DÖRT OLAYDAN ÜÇÜ kayboluyordu.
 * Ne hata çıkıyordu ne uyarı — yalnız haftalık sayılar, konuşma dengesi ve
 * hocanın raporu sessizce eksik oluyordu.
 */
import { flushStats, loadStatsSummary, recordStat, recordStats } from "../src/statsStore";
import { setActiveLanguage } from "../src/languages";

beforeEach(async () => {
  setActiveLanguage("ar");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
});

test("AYNI ANDA yazılan sayaçların hiçbiri kaybolmaz", async () => {
  await Promise.all([
    recordStat("spoken"),
    recordStat("spokenCorrect"),
    recordStat("reviewed"),
    recordStat("produced"),
  ]);
  const s = await loadStatsSummary();
  expect(s.total.spoken).toBe(1);
  expect(s.total.spokenCorrect).toBe(1);
  expect(s.total.reviewed).toBe(1);
  expect(s.total.produced).toBe(1);
});

test("beklemeden (void ile) atılan yazmalar da kaybolmaz", async () => {
  // Ekranlar `void recordStat(...)` diye çağırıyor; kuyruk onları da tutmalı.
  void recordStat("spoken");
  void recordStat("reviewed");
  void recordStat("produced");
  await flushStats();
  const s = await loadStatsSummary();
  expect(s.total.spoken).toBe(1);
  expect(s.total.reviewed).toBe(1);
  expect(s.total.produced).toBe(1);
});

test("aynı sayaç arka arkaya artırılınca TOPLANIR", async () => {
  await Promise.all(Array.from({ length: 20 }, () => recordStat("readSentence")));
  const s = await loadStatsSummary();
  expect(s.total.readSentence).toBe(20);
});

test("toplu yazma tek seferde hepsini kaydeder", async () => {
  await recordStats(["spoken", "spokenCorrect", "reviewed", "produced"]);
  const s = await loadStatsSummary();
  expect(s.total.spoken).toBe(1);
  expect(s.total.produced).toBe(1);
});

test("boş toplu yazma çökertmez", async () => {
  await recordStats([]);
  expect((await loadStatsSummary()).total).toEqual({});
});

test("n>1 ile artırma çalışır", async () => {
  await recordStat("shadowed", 5);
  expect((await loadStatsSummary()).total.shadowed).toBe(5);
});

test("DİL BAŞINA ayrı sayılır — Fransızca çalışmak Arapça sayacını şişirmez", async () => {
  await recordStat("produced");
  setActiveLanguage("fr");
  await recordStat("produced");
  expect((await loadStatsSummary()).total.produced).toBe(1);
  setActiveLanguage("ar");
  expect((await loadStatsSummary()).total.produced).toBe(1);
});
