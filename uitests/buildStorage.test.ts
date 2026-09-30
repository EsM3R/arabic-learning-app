/**
 * Cümle Kurma v3 deposu: TEMBEL YÜKSELTME.
 *
 * Şema göçü hiç çalışmamış olabilir (damgasız eski kurulum, eski yedekten
 * dönüş). O durumda da v1 kayıtları v2 olarak okunmalı; okuma hiçbir şey
 * yazmamalı ve eski anahtarlar asla silinmemeli. Dil başına anahtar uzayı
 * korunur: Arapça eksiz, diğer diller ".dil" ekli.
 */
import {
  loadBuildBlocks,
  loadBuildHistory,
  loadBuildMemory,
  loadBuildProgress2,
  loadBuildSets2,
  loadBuildUi,
  saveBuildSets2,
  saveBuildUi,
} from "../src/storage";
import { setActiveLanguage } from "../src/languages";
import { MASTER_SENTENCES, recordAttempt, upgradeSetV1 } from "../src/sentencebuilding";
import type { ProgressMap } from "../src/sentencebuilding";

const AsyncStorage = require("@react-native-async-storage/async-storage");
const v1Set = () => JSON.parse(JSON.stringify(require("../tests/fixtures/v1-set.json")));

beforeEach(async () => {
  setActiveLanguage("en");
  await AsyncStorage.clear();
});

afterAll(() => setActiveLanguage("ar"));

test("v1 kayıtları v2 olarak okunur; okuma hiçbir şey yazmaz", async () => {
  let m: ProgressMap = {};
  for (let i = 0; i < MASTER_SENTENCES; i += 1) m = recordAttempt(m, "zaman-baglac", "dogru", true);
  await AsyncStorage.setItem("buildSets.v1.en", JSON.stringify([v1Set()]));
  await AsyncStorage.setItem("buildProgress.v1.en", JSON.stringify(m));
  const keysBefore = (await AsyncStorage.getAllKeys()).sort();

  const sets = await loadBuildSets2();
  expect(sets).toHaveLength(1);
  expect(sets[0].v).toBe(2);
  expect(sets[0].lang).toBe("en");
  expect((await loadBuildProgress2())["zaman-baglac"].status).toBe("verify");
  expect((await loadBuildBlocks()).before.producedOk).toBe(1);
  expect(await loadBuildMemory()).toHaveLength(4);
  expect((await loadBuildHistory())["zaman-baglac|rutin"].episode).toBe(1);
  expect((await loadBuildUi()).connSeen.before).toBe(2);

  expect((await AsyncStorage.getAllKeys()).sort()).toEqual(keysBefore);
});

test("v2 kaydı varken eski ekranın yeni v1 seti de görünür; dil anahtarları karışmaz", async () => {
  const a = v1Set();
  const b = { ...v1Set(), createdAt: "2026-09-09T00:00:00.000Z" };
  await saveBuildSets2([upgradeSetV1(a, "en")]);
  await AsyncStorage.setItem("buildSets.v1.en", JSON.stringify([b, a]));
  const sets = await loadBuildSets2();
  expect(sets.map((s) => s.createdAt)).toEqual(["2026-09-09T00:00:00.000Z", "2026-09-01T08:00:00.000Z"]);

  setActiveLanguage("ar");
  expect(await loadBuildSets2()).toEqual([]);
  await AsyncStorage.setItem("buildSets.v1", JSON.stringify([a]));
  expect((await loadBuildSets2())[0].lang).toBe("ar");
});

test("kayıtlı arayüz durumu okunur; eksik alanlar varsayılanla dolar", async () => {
  await saveBuildUi({ connSeen: { when: 2 }, reorderSeen: 3, fastFlow: false });
  const ui = await loadBuildUi();
  expect(ui.connSeen.when).toBe(2);
  expect(ui.fastFlow).toBe(false);
  await AsyncStorage.setItem("buildUi.v1.en", "{bozuk");
  expect((await loadBuildUi()).fastFlow).toBe(true);
});

test("tembel tohum yalnız eski setlerden: yeni hattın kurulmamış cümleleri tekrara, taşları hafızaya girmez", async () => {
  // Yeni hattın seti (origin yok): hazır ama hiç kurulmamış cümleler taşıyor.
  const fresh = { ...upgradeSetV1(v1Set(), "en"), id: "yeni", createdAt: "2026-09-10T00:00:00.000Z" };
  delete (fresh as { origin?: string }).origin;
  await saveBuildSets2([fresh]);
  expect(await loadBuildMemory()).toEqual([]);
  expect(await loadBuildBlocks()).toEqual({});
  expect((await loadBuildUi()).connSeen).toEqual({});
  // Eski (v1'den gelen) set yine tohumlanır.
  await saveBuildSets2([fresh, upgradeSetV1(v1Set(), "en")]);
  expect(await loadBuildMemory()).toHaveLength(4);
  expect((await loadBuildBlocks()).before.producedOk).toBe(1);
});
